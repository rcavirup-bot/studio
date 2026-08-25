const DRIVE_FOLDER_ID = "1w0tNfhZzmanDLI5sq1dxhmqgh5fbxvHV";

// Enable Google Drive API in Google Cloud, restrict a browser key to your
// website domain, then paste the key below.
const GOOGLE_DRIVE_API_KEY = "AIzaSyDbFk_auMNRCkkvH2qD9_KRFg48MEbw6p4";
const PAGE_SIZE = 100;
const SELECTION_LIMIT = 5;

const photos = [];
const gallery = document.querySelector("#gallery");
const selectedCount = document.querySelector("#selected-count");
const photoCount = document.querySelector("#photo-count");
const selectionCountBadge = document.querySelector(".selection-count");
const filters = document.querySelectorAll(".filter-button");
const lightbox = document.querySelector("#lightbox");
const lightboxImage = document.querySelector("#lightbox-image");
const lightboxCaption = document.querySelector("#lightbox-caption");
const lightboxHeart = document.querySelector(".lightbox-heart");
const previousPhoto = document.querySelector("#previous-photo");
const nextPhoto = document.querySelector("#next-photo");
const lightboxCount = document.querySelector("#lightbox-count");
const summaryDialog = document.querySelector("#selection-summary");
const summaryCount = document.querySelector("#summary-count");
const selectionProgress = document.querySelector(".selection-progress");
const selectionProgressFill = document.querySelector("#selection-progress-fill");
const summaryLimit = document.querySelector("#summary-limit");
const summaryLimitTotal = document.querySelector("#summary-limit-total");
const summaryAlbum = document.querySelector("#summary-album");
const summaryYes = document.querySelector(".summary-yes");
const limitDialog = document.querySelector("#limit-dialog");
const logoutDialog = document.querySelector("#logout-dialog");
const infoDialog = document.querySelector("#info-dialog");
const tutorialVideo = document.querySelector("#tutorial-video");
const tutorialVideoWrap = document.querySelector(".tutorial-video");
const albumSelectButton = document.querySelector(".album-select-button");
const albumOptions = document.querySelector(".album-options");
let currentFilter = "all";
let nextPageToken = null;
let loading = false;
let currentPhotoIndex = -1;
let totalDrivePhotos = null;

albumSelectButton.addEventListener("click", () => {
  const willOpen = albumSelectButton.getAttribute("aria-expanded") !== "true";
  albumSelectButton.setAttribute("aria-expanded", String(willOpen));
  albumOptions.hidden = !willOpen;
});

albumOptions.addEventListener("click", event => {
  const option = event.target.closest("[role='option']");
  if (!option) return;
  albumSelectButton.querySelector("span").textContent = option.textContent;
  albumOptions.querySelectorAll("[role='option']").forEach(item => {
    item.setAttribute("aria-selected", String(item === option));
  });
  albumSelectButton.setAttribute("aria-expanded", "false");
  albumOptions.hidden = true;
});

document.addEventListener("click", event => {
  if (!event.target.closest(".select-wrap")) {
    albumSelectButton.setAttribute("aria-expanded", "false");
    albumOptions.hidden = true;
  }
});

const albumSelector = document.querySelector(".album-selector");
const siteHeader = document.querySelector(".site-header");
let albumScrollFrame;

function updateAlbumGlass() {
  const isSticky = albumSelector.getBoundingClientRect().top <= siteHeader.offsetHeight + 1 && window.scrollY > 0;
  albumSelector.classList.toggle("scrolled", isSticky);
  albumScrollFrame = null;
}

window.addEventListener("scroll", () => {
  if (!albumScrollFrame) albumScrollFrame = requestAnimationFrame(updateAlbumGlass);
}, { passive: true });

window.addEventListener("resize", updateAlbumGlass);
updateAlbumGlass();

const heartIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 21.2 10.55 19.88C5.4 15.2 2 12.1 2 8.3 2 5.2 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09A6.04 6.04 0 0 1 16.5 3C19.58 3 22 5.2 22 8.3c0 3.8-3.4 6.9-8.55 11.58L12 21.2Z"/>
  </svg>`;

function updateCounts() {
  const selectedTotal = photos.filter(photo => photo.selected).length;
  selectedCount.textContent = selectedTotal;
  photoCount.textContent = SELECTION_LIMIT;
  selectionCountBadge.classList.toggle("exceeded", selectedTotal > SELECTION_LIMIT);
}

function showSelectionLimitDialog() {
  document.querySelector("#limit-value").textContent = SELECTION_LIMIT;
  document.body.classList.add("modal-open");
  void document.body.offsetHeight;
  limitDialog.showModal();
}

function updateLightbox() {
  const photo = photos[currentPhotoIndex];
  if (!photo) return;
  lightboxImage.src = `https://drive.google.com/thumbnail?id=${photo.id}&sz=w3000`;
  lightboxImage.alt = photo.name;
  lightboxCaption.textContent = photo.name;
  lightboxHeart.innerHTML = heartIcon;
  lightboxHeart.setAttribute("aria-pressed", String(photo.selected));
  lightboxHeart.setAttribute("aria-label", `${photo.selected ? "Remove from" : "Add to"} selections`);
  previousPhoto.disabled = currentPhotoIndex === 0;
  nextPhoto.disabled = currentPhotoIndex === photos.length - 1 && !nextPageToken;
  const displayedTotal = totalDrivePhotos ?? photos.length;
  lightboxCount.textContent = `${currentPhotoIndex + 1}/${displayedTotal}${totalDrivePhotos === null && nextPageToken ? "+" : ""}`;
}

async function countDrivePhotos() {
  if (!GOOGLE_DRIVE_API_KEY) return;

  const query = `'${DRIVE_FOLDER_ID}' in parents and trashed = false and mimeType contains 'image/'`;
  let pageToken = "";
  let total = 0;

  try {
    do {
      const params = new URLSearchParams({
        key: GOOGLE_DRIVE_API_KEY,
        q: query,
        pageSize: "1000",
        fields: "nextPageToken,files(id)"
      });
      if (pageToken) params.set("pageToken", pageToken);

      const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`);
      if (!response.ok) throw new Error(`Google Drive returned ${response.status}`);
      const data = await response.json();
      total += data.files.length;
      pageToken = data.nextPageToken || "";
    } while (pageToken);

    totalDrivePhotos = total;
    if (lightbox.open) updateLightbox();
  } catch (error) {
    console.warn("Could not count all Drive photos:", error);
  }
}

function renderGallery() {
  const visible = currentFilter === "selected"
    ? photos.filter(photo => photo.selected)
    : photos;

  if (!GOOGLE_DRIVE_API_KEY) {
    gallery.innerHTML = `<p class="gallery-message">Add your Google Drive API key to <strong>GOOGLE_DRIVE_API_KEY</strong> at the top of <strong>script.js</strong> to display this public folder.</p>`;
    return;
  }

  const cards = visible.map(photo => `
    <article class="photo-card${photo.selected ? " selected" : ""}" data-id="${photo.id}">
      <div class="photo-wrap">
        <img src="${photo.src}" alt="${photo.name}" loading="lazy">
        <button class="heart" type="button" aria-label="${photo.selected ? "Remove from" : "Add to"} selections" aria-pressed="${photo.selected}">${heartIcon}</button>
      </div>
      <p class="filename">${photo.name}</p>
    </article>`).join("");

  const empty = currentFilter === "selected" && !visible.length
    ? `<p class="empty-state">No photos selected yet.</p>`
    : "";
  const loadMore = currentFilter === "all" && nextPageToken
    ? `<button class="load-more" type="button" ${loading ? "disabled" : ""}>${loading ? "Loading…" : "Load More"}</button>`
    : "";

  gallery.innerHTML = cards + empty + loadMore;
  updateCounts();
}

async function fetchDrivePhotos(pageToken = "") {
  if (!GOOGLE_DRIVE_API_KEY || loading) return false;
  loading = true;
  renderGallery();

  const query = `'${DRIVE_FOLDER_ID}' in parents and trashed = false and mimeType contains 'image/'`;
  const params = new URLSearchParams({
    key: GOOGLE_DRIVE_API_KEY,
    q: query,
    pageSize: PAGE_SIZE,
    orderBy: "name_natural",
    fields: "nextPageToken,files(id,name,mimeType)"
  });
  if (pageToken) params.set("pageToken", pageToken);

  try {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`);
    if (!response.ok) throw new Error(`Google Drive returned ${response.status}`);
    const data = await response.json();
    photos.push(...data.files.map(file => ({
      id: file.id,
      name: file.name,
      src: `https://drive.google.com/thumbnail?id=${file.id}&sz=w1200`,
      selected: false
    })));
    nextPageToken = data.nextPageToken || null;
  } catch (error) {
    gallery.innerHTML = `<p class="gallery-message">The photos could not be loaded. Confirm that the folder and its images are public and that the Drive API key is valid.<br><small>${error.message}</small></p>`;
    loading = false;
    return false;
  }

  loading = false;
  renderGallery();
  return true;
}

gallery.addEventListener("click", event => {
  if (event.target.closest(".load-more")) {
    fetchDrivePhotos(nextPageToken);
    return;
  }

  const clickedImage = event.target.closest(".photo-wrap img");
  if (clickedImage) {
    const card = clickedImage.closest(".photo-card");
    const photo = photos.find(item => item.id === card.dataset.id);
    if (!photo) return;
    currentPhotoIndex = photos.indexOf(photo);
    updateLightbox();
    lightbox.showModal();
    document.body.classList.add("lightbox-open");
    return;
  }

  const heartButton = event.target.closest(".heart");
  if (!heartButton) return;
  const card = heartButton.closest(".photo-card");
  const photo = photos.find(item => item.id === card.dataset.id);
  if (!photo) return;
  photo.selected = !photo.selected;
  const showLimitWarning = photo.selected && photos.filter(item => item.selected).length === SELECTION_LIMIT + 1;

  if (currentFilter === "selected" && !photo.selected) {
    card.remove();
    if (!photos.some(item => item.selected)) renderGallery();
  } else {
    card.classList.toggle("selected", photo.selected);
    heartButton.setAttribute("aria-pressed", String(photo.selected));
    heartButton.setAttribute("aria-label", `${photo.selected ? "Remove from" : "Add to"} selections`);
  }

  updateCounts();
  if (showLimitWarning) {
    showSelectionLimitDialog();
  }
});

lightboxHeart.addEventListener("click", () => {
  const photo = photos[currentPhotoIndex];
  if (!photo) return;
  photo.selected = !photo.selected;
  const showLimitWarning = photo.selected && photos.filter(item => item.selected).length === SELECTION_LIMIT + 1;
  lightboxHeart.setAttribute("aria-pressed", String(photo.selected));
  lightboxHeart.setAttribute("aria-label", `${photo.selected ? "Remove from" : "Add to"} selections`);

  const card = gallery.querySelector(`[data-id="${CSS.escape(photo.id)}"]`);
  if (card) {
    card.classList.toggle("selected", photo.selected);
    const cardHeart = card.querySelector(".heart");
    cardHeart.setAttribute("aria-pressed", String(photo.selected));
    cardHeart.setAttribute("aria-label", `${photo.selected ? "Remove from" : "Add to"} selections`);
  }
  updateCounts();
  if (showLimitWarning) {
    showSelectionLimitDialog();
  }
});

previousPhoto.addEventListener("click", () => {
  if (currentPhotoIndex > 0) {
    currentPhotoIndex -= 1;
    updateLightbox();
  }
});

nextPhoto.addEventListener("click", async () => {
  if (currentPhotoIndex < photos.length - 1) {
    currentPhotoIndex += 1;
    updateLightbox();
    return;
  }

  if (nextPageToken) {
    nextPhoto.disabled = true;
    const previousLength = photos.length;
    const loaded = await fetchDrivePhotos(nextPageToken);
    if (loaded && photos.length > previousLength) {
      currentPhotoIndex += 1;
    }
    updateLightbox();
  }
});

document.querySelector(".lightbox-close").addEventListener("click", () => lightbox.close());

lightbox.addEventListener("cancel", event => event.preventDefault());

lightbox.addEventListener("close", () => {
  lightboxImage.src = "";
  document.body.classList.remove("lightbox-open");
});

filters.forEach(button => button.addEventListener("click", () => {
  const preservedScrollY = window.scrollY;
  currentFilter = button.dataset.filter;
  filters.forEach(item => item.classList.toggle("active", item === button));
  document.querySelector(".filter-control").classList.toggle("selections-active", currentFilter === "selected");
  gallery.style.removeProperty("min-height");
  renderGallery();
  requestAnimationFrame(() => {
    const maximumScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
    window.scrollTo(0, Math.min(preservedScrollY, maximumScroll));
  });
}));

document.querySelector(".header-submit").addEventListener("click", () => {
  const selectedPhotos = photos.filter(photo => photo.selected);
  summaryAlbum.textContent = albumSelectButton.querySelector("span").textContent;
  summaryCount.textContent = selectedPhotos.length;
  summaryLimit.textContent = SELECTION_LIMIT;
  summaryLimitTotal.textContent = SELECTION_LIMIT;
  selectionProgress.setAttribute("aria-valuemax", String(SELECTION_LIMIT));
  selectionProgress.setAttribute("aria-valuenow", String(selectedPhotos.length));
  selectionProgress.classList.toggle("exceeded", selectedPhotos.length > SELECTION_LIMIT);
  selectionProgressFill.style.width = `${Math.min(selectedPhotos.length / SELECTION_LIMIT, 1) * 100}%`;
  summaryYes.disabled = selectedPhotos.length > SELECTION_LIMIT;
  document.body.classList.add("modal-open");
  void document.body.offsetHeight;
  summaryDialog.showModal();
});

document.querySelector(".summary-no").addEventListener("click", () => summaryDialog.close());
summaryYes.addEventListener("click", () => {
  summaryDialog.close();
  document.dispatchEvent(new CustomEvent("gallery:selection-confirmed", {
    detail: { photos: photos.filter(photo => photo.selected) }
  }));
});
document.querySelector(".limit-ok").addEventListener("click", () => limitDialog.close());
document.querySelector(".header-logout").addEventListener("click", () => {
  document.body.classList.add("modal-open");
  void document.body.offsetHeight;
  logoutDialog.showModal();
});
document.querySelector(".logout-no").addEventListener("click", () => logoutDialog.close());
document.querySelector(".logout-yes").addEventListener("click", () => {
  logoutDialog.close();
  document.dispatchEvent(new CustomEvent("gallery:logout-confirmed"));
});

document.querySelector(".header-info").addEventListener("click", () => {
  tutorialVideo.src = "";
  tutorialVideoWrap.classList.remove("playing");
  document.body.classList.add("modal-open");
  void document.body.offsetHeight;
  infoDialog.showModal();
});

document.querySelector(".tutorial-poster").addEventListener("click", () => {
  tutorialVideo.src = `${tutorialVideo.dataset.src}&autoplay=1`;
  tutorialVideoWrap.classList.add("playing");
});

document.querySelector(".info-close").addEventListener("click", () => infoDialog.close());
infoDialog.addEventListener("close", () => {
  tutorialVideo.src = "";
  tutorialVideoWrap.classList.remove("playing");
});

[summaryDialog, limitDialog, logoutDialog, infoDialog].forEach(dialog => {
  dialog.addEventListener("cancel", event => event.preventDefault());
  dialog.addEventListener("close", () => {
    if (!summaryDialog.open && !limitDialog.open && !logoutDialog.open && !infoDialog.open) {
      document.body.classList.remove("modal-open");
    }
  });
});

renderGallery();
fetchDrivePhotos().then(loaded => {
  if (loaded) countDrivePhotos();
});

document.addEventListener("contextmenu", event => event.preventDefault());
document.addEventListener("dragstart", event => {
  if (event.target instanceof HTMLImageElement) event.preventDefault();
});
