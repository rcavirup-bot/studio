const DRIVE_FOLDER_ID = "1w0tNfhZzmanDLI5sq1dxhmqgh5fbxvHV";

// Enable Google Drive API in Google Cloud, restrict a browser key to your
// website domain, then paste the key below.
const GOOGLE_DRIVE_API_KEY = "AIzaSyDbFk_auMNRCkkvH2qD9_KRFg48MEbw6p4";
const PAGE_SIZE = 100;
const SELECTION_LIMIT = 5;
const TILE_THUMBNAIL_WIDTH = 240;
const FULL_VIEW_WIDTH = 900;

const driveThumbnailUrl = (fileId, width) =>
  `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`;

const photos = [];
const driveFolders = [];
const selectedPhotosById = new Map();
const folderHistory = [];
const folderCache = new Map();
const folderPreloads = new Map();
const driveFolderNames = new Map();
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
const bottomFolderBack = document.querySelector(".bottom-folder-back");
let currentFilter = "all";
let nextPageToken = null;
let loading = false;
let currentPhotoIndex = -1;
let totalDrivePhotos = null;
let currentDriveFolderId = DRIVE_FOLDER_ID;
let lightboxPhotoList = photos;
let suppressNextFolderPop = false;

window.history.replaceState({
  galleryFolderId: DRIVE_FOLDER_ID,
  folderTrail: []
}, "");

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

function updateAlbumGlass() {
  albumSelector.classList.toggle("scrolled", window.scrollY > 4);
  const galleryProgressWrap = gallery.querySelector(".gallery-progress-wrap");
  if (galleryProgressWrap) {
    const touchesStickyArea = galleryProgressWrap.getBoundingClientRect().top <= albumSelector.getBoundingClientRect().bottom + 1;
    galleryProgressWrap.classList.toggle("under-sticky", touchesStickyArea);
  }
}

window.addEventListener("scroll", updateAlbumGlass, { passive: true });

window.addEventListener("resize", updateAlbumGlass);
updateAlbumGlass();

const heartIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 21.2 10.55 19.88C5.4 15.2 2 12.1 2 8.3 2 5.2 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09A6.04 6.04 0 0 1 16.5 3C19.58 3 22 5.2 22 8.3c0 3.8-3.4 6.9-8.55 11.58L12 21.2Z"/>
  </svg>`;

function updateBottomFolderIcon() {
  const insideFolder = currentFilter === "all" && folderHistory.length > 0;
  const mode = insideFolder ? "back" : "home";
  const currentMode = bottomFolderBack.dataset.mode;
  const pendingMode = bottomFolderBack.dataset.pendingMode;
  if (pendingMode === mode || (currentMode === mode && !pendingMode)) return;
  if (pendingMode) {
    bottomFolderBack.dataset.pendingMode = mode;
    return;
  }

  const applyIcon = nextMode => {
    bottomFolderBack.dataset.mode = nextMode;
    bottomFolderBack.setAttribute("aria-label", nextMode === "back" ? "Go back to previous folder" : "Root folder");
    bottomFolderBack.innerHTML = nextMode === "back"
      ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>`
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.7 10.7 10.8 3a1.75 1.75 0 0 1 2.4 0l8.1 7.7c1.1 1 .4 2.8-1.2 2.8h-1V20c0 1.1-.9 2-2 2h-3.2v-5.2c0-1-.8-1.8-1.8-1.8h-.2c-1 0-1.8.8-1.8 1.8V22H6.9c-1.1 0-2-.9-2-2v-6.5h-1c-1.6 0-2.3-1.8-1.2-2.8Z"/></svg>`;
  };

  if (!bottomFolderBack.dataset.mode) {
    applyIcon(mode);
    return;
  }

  bottomFolderBack.dataset.pendingMode = mode;
  bottomFolderBack.classList.add("icon-changing-out");
  window.setTimeout(() => {
    const nextMode = bottomFolderBack.dataset.pendingMode;
    delete bottomFolderBack.dataset.pendingMode;
    applyIcon(nextMode);
    bottomFolderBack.classList.remove("icon-changing-out");
    bottomFolderBack.classList.add("icon-changing-in");
    window.setTimeout(() => bottomFolderBack.classList.remove("icon-changing-in"), 220);
  }, 150);
}

function updateCounts() {
  const selectedTotal = selectedPhotosById.size;
  selectedCount.textContent = selectedTotal;
  photoCount.textContent = SELECTION_LIMIT;
  gallery.classList.toggle("limit-reached", selectedTotal === SELECTION_LIMIT);
  gallery.classList.toggle("selection-exceeded", selectedTotal > SELECTION_LIMIT);
  selectionCountBadge.classList.toggle("limit-reached", selectedTotal === SELECTION_LIMIT);
  selectionCountBadge.classList.toggle("exceeded", selectedTotal > SELECTION_LIMIT);
  const galleryProgress = gallery.querySelector(".gallery-selection-progress");
  if (galleryProgress) {
    galleryProgress.setAttribute("aria-valuenow", String(selectedTotal));
    galleryProgress.classList.toggle("limit-reached", selectedTotal === SELECTION_LIMIT);
    galleryProgress.classList.toggle("exceeded", selectedTotal > SELECTION_LIMIT);
    galleryProgress.querySelector("span").style.width = `${Math.min(selectedTotal / SELECTION_LIMIT, 1) * 100}%`;
    const selectedLabel = galleryProgress.closest(".gallery-progress-wrap")?.querySelector(".gallery-progress-selected");
    if (selectedLabel) selectedLabel.textContent = `${selectedTotal} Photos selected`;
  }
}

function showSelectionLimitDialog() {
  document.querySelector("#limit-value").textContent = SELECTION_LIMIT;
  document.body.classList.add("modal-open");
  void document.body.offsetHeight;
  limitDialog.showModal();
}

function updateLightbox() {
  const photo = lightboxPhotoList[currentPhotoIndex];
  if (!photo) return;
  lightboxImage.src = driveThumbnailUrl(photo.id, FULL_VIEW_WIDTH);
  lightboxImage.alt = photo.name;
  lightboxCaption.textContent = photo.name;
  lightboxHeart.innerHTML = heartIcon;
  lightboxHeart.setAttribute("aria-pressed", String(photo.selected));
  lightboxHeart.setAttribute("aria-label", `${photo.selected ? "Remove from" : "Add to"} selections`);
  previousPhoto.disabled = currentPhotoIndex === 0;
  const canLoadMore = currentFilter === "all" && nextPageToken;
  nextPhoto.disabled = currentPhotoIndex === lightboxPhotoList.length - 1 && !canLoadMore;
  const displayedTotal = currentFilter === "selected" ? lightboxPhotoList.length : (totalDrivePhotos ?? photos.length);
  lightboxCount.textContent = `${currentPhotoIndex + 1}/${displayedTotal}${currentFilter === "all" && totalDrivePhotos === null && nextPageToken ? "+" : ""}`;
}

async function countDrivePhotos(folderId = currentDriveFolderId) {
  if (!GOOGLE_DRIVE_API_KEY) return;

  const query = `'${folderId}' in parents and trashed = false and mimeType contains 'image/'`;
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

function photoCardMarkup(photo) {
  return `
    <article class="photo-card${photo.selected ? " selected" : ""}" data-id="${photo.id}">
      <div class="photo-wrap">
        <img src="${photo.src}" alt="${photo.name}" decoding="async">
        <button class="heart" type="button" aria-label="${photo.selected ? "Remove from" : "Add to"} selections" aria-pressed="${photo.selected}">${heartIcon}</button>
      </div>
      <p class="filename">${photo.name}</p>
    </article>`;
}

function folderTitleMarkup() {
  const folderName = driveFolderNames.get(currentDriveFolderId);
  return `<h2 class="gallery-folder-title${folderName ? "" : " title-loading"}">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path class="folder-rear" d="M3 6.2c0-1.1.9-2 2-2h5.1c.7 0 1.3.2 1.8.7l1.5 1.3c.4.4 1 .6 1.6.6h4c1.1 0 2 .9 2 2v9.1H3V6.2Z"/>
      <path class="folder-paper" d="M5.1 9c0-.8.6-1.4 1.4-1.4h11c.8 0 1.4.6 1.4 1.4v7.4H5.1V9Z"/>
      <path class="folder-front" d="M3 10.3c0-1.1.9-2 2-2h14c1.1 0 2 .9 2 2v7.5c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2v-7.5Z"/>
    </svg>
    <span>${folderName || ""}</span>
  </h2>`;
}

function animateSelectionRemoval(card) {
  if (!card || card.classList.contains("removing")) return;
  const remainingCards = [...gallery.querySelectorAll(".photo-card:not(.removing)")]
    .filter(item => item !== card);
  const previousPositions = new Map(remainingCards.map(item => [item, item.getBoundingClientRect()]));
  card.classList.add("removing");
  window.setTimeout(() => {
    card.remove();
    if (currentFilter === "selected" && !selectedPhotosById.size) {
      renderGallery(true);
      return;
    }

    remainingCards.forEach(item => {
      if (!item.isConnected) return;
      const previous = previousPositions.get(item);
      const current = item.getBoundingClientRect();
      const offsetX = previous.left - current.left;
      const offsetY = previous.top - current.top;
      if (!offsetX && !offsetY) return;
      item.style.transition = "none";
      item.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
      item.style.willChange = "transform";
    });

    void gallery.offsetWidth;
    remainingCards.forEach(item => {
      if (!item.isConnected || !item.style.transform) return;
      item.style.transition = "transform .38s cubic-bezier(.22, .8, .3, 1)";
      item.style.transform = "";
      window.setTimeout(() => {
        item.style.transition = "";
        item.style.willChange = "";
      }, 400);
    });
  }, 280);
}

function renderGallery(animateEntry = false) {
  updateBottomFolderIcon();
  gallery.classList.toggle("animate-entry", animateEntry);
  const visible = currentFilter === "selected"
    ? [...selectedPhotosById.values()]
    : photos;
  if (!GOOGLE_DRIVE_API_KEY) {
    gallery.innerHTML = `<p class="gallery-message">Add your Google Drive API key to <strong>GOOGLE_DRIVE_API_KEY</strong> at the top of <strong>script.js</strong> to display this public folder.</p>`;
    return;
  }

  const folderTitle = currentFilter === "all" ? folderTitleMarkup() : "";
  const galleryProgress = currentFilter === "selected" ? `
    <div class="gallery-progress-wrap">
      <div class="gallery-selection-progress${selectedPhotosById.size === SELECTION_LIMIT ? " limit-reached" : ""}${selectedPhotosById.size > SELECTION_LIMIT ? " exceeded" : ""}"
        role="progressbar" aria-label="Selection progress" aria-valuemin="0"
        aria-valuemax="${SELECTION_LIMIT}" aria-valuenow="${selectedPhotosById.size}">
        <span style="width:${Math.min(selectedPhotosById.size / SELECTION_LIMIT, 1) * 100}%"></span>
      </div>
      <div class="gallery-progress-labels">
        <span class="gallery-progress-selected">${selectedPhotosById.size} Photos selected</span>
        <span>Max limit : ${SELECTION_LIMIT} Photos</span>
      </div>
    </div>` : "";

  const folderCards = currentFilter === "all" ? driveFolders.map(folder => `
    <article class="photo-card folder-card" data-folder-id="${folder.id}">
      <div class="folder-visual" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path class="folder-rear" d="M3 6.2c0-1.1.9-2 2-2h5.1c.7 0 1.3.2 1.8.7l1.5 1.3c.4.4 1 .6 1.6.6h4c1.1 0 2 .9 2 2v9.1H3V6.2Z"/>
          <path class="folder-paper" d="M5.1 9c0-.8.6-1.4 1.4-1.4h11c.8 0 1.4.6 1.4 1.4v7.4H5.1V9Z"/>
          <path class="folder-front" d="M3 10.3c0-1.1.9-2 2-2h14c1.1 0 2 .9 2 2v7.5c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2v-7.5Z"/>
        </svg>
      </div>
      <p class="filename">${folder.name}</p>
    </article>`).join("") : "";

  const cards = visible.map(photoCardMarkup).join("");

  const empty = currentFilter === "selected" && !visible.length
    ? `<p class="empty-state">No photos selected yet.</p>`
    : currentFilter === "all" && !driveFolders.length && !visible.length
      ? `<p class="empty-state empty-folder-state">No items.</p>`
      : "";
  const loadMore = currentFilter === "all" && nextPageToken
    ? `<button class="load-more" type="button" ${loading ? "disabled" : ""}>${loading ? "Loading…" : "Load More"}</button>`
    : "";

  gallery.innerHTML = folderTitle + galleryProgress + folderCards + cards + empty + loadMore;
  updateCounts();
  updateAlbumGlass();
  if (animateEntry) {
    window.setTimeout(() => gallery.classList.remove("animate-entry"), 360);
  }
}

async function fetchDriveFolderName(folderId) {
  if (!GOOGLE_DRIVE_API_KEY || driveFolderNames.has(folderId)) return;

  const params = new URLSearchParams({
    key: GOOGLE_DRIVE_API_KEY,
    fields: "id,name",
    supportsAllDrives: "true"
  });

  try {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?${params}`);
    if (!response.ok) throw new Error(`Google Drive returned ${response.status}`);
    const folder = await response.json();
    driveFolderNames.set(folder.id, folder.name);
  } catch (error) {
    console.warn("Could not load Drive folder name:", error);
  }
}

function preloadDriveFolder(folderId) {
  if (!GOOGLE_DRIVE_API_KEY || folderCache.has(folderId)) {
    return Promise.resolve(folderCache.get(folderId));
  }
  if (folderPreloads.has(folderId)) return folderPreloads.get(folderId);

  const folderQuery = `'${folderId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`;
  const photoQuery = `'${folderId}' in parents and trashed = false and mimeType contains 'image/'`;
  const makeParams = (query, pageSize, fields) => new URLSearchParams({
    key: GOOGLE_DRIVE_API_KEY,
    q: query,
    pageSize: String(pageSize),
    orderBy: "name_natural",
    fields
  });

  const preload = Promise.all([
    fetch(`https://www.googleapis.com/drive/v3/files?${makeParams(folderQuery, 1000, "files(id,name)")}`).then(response => {
      if (!response.ok) throw new Error(`Google Drive returned ${response.status}`);
      return response.json();
    }),
    fetch(`https://www.googleapis.com/drive/v3/files?${makeParams(photoQuery, PAGE_SIZE, "nextPageToken,files(id,name,mimeType)")}`).then(response => {
      if (!response.ok) throw new Error(`Google Drive returned ${response.status}`);
      return response.json();
    })
  ]).then(([folderData, photoData]) => {
    const cached = {
      folders: folderData.files,
      photos: photoData.files.map(file => ({
        id: file.id,
        name: file.name,
        src: driveThumbnailUrl(file.id, TILE_THUMBNAIL_WIDTH)
      })),
      nextPageToken: photoData.nextPageToken || null
    };
    folderCache.set(folderId, cached);
    return cached;
  }).catch(error => {
    console.warn("Could not preload Drive folder:", error);
    return null;
  }).finally(() => folderPreloads.delete(folderId));

  folderPreloads.set(folderId, preload);
  return preload;
}

function cacheCurrentFolder() {
  folderCache.set(currentDriveFolderId, {
    folders: driveFolders.map(folder => ({ ...folder })),
    photos: photos.map(({ id, name, src }) => ({ id, name, src })),
    nextPageToken
  });
}

async function fetchDriveFolders(folderId = currentDriveFolderId, shouldRender = true) {
  if (!GOOGLE_DRIVE_API_KEY) return false;

  const query = `'${folderId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`;
  const params = new URLSearchParams({
    key: GOOGLE_DRIVE_API_KEY,
    q: query,
    pageSize: "1000",
    orderBy: "name_natural",
    fields: "files(id,name)"
  });

  try {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`);
    if (!response.ok) throw new Error(`Google Drive returned ${response.status}`);
    const data = await response.json();
    data.files.forEach(folder => driveFolderNames.set(folder.id, folder.name));
    driveFolders.push(...data.files);
    data.files.forEach(folder => preloadDriveFolder(folder.id));
    if (shouldRender) renderGallery();
    return true;
  } catch (error) {
    console.warn("Could not load Drive subfolders:", error);
    return false;
  }
}

async function fetchDrivePhotos(pageToken = "", folderId = currentDriveFolderId, shouldRender = true) {
  if (!GOOGLE_DRIVE_API_KEY || loading) return false;
  const isAppending = Boolean(pageToken);
  loading = true;
  if (shouldRender && isAppending) {
    const loadMoreButton = gallery.querySelector(".load-more");
    if (loadMoreButton) {
      loadMoreButton.disabled = true;
      loadMoreButton.textContent = "Loading…";
    }
  }

  const query = `'${folderId}' in parents and trashed = false and mimeType contains 'image/'`;
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
    const newPhotos = data.files.map(file => ({
      id: file.id,
      name: file.name,
      src: driveThumbnailUrl(file.id, TILE_THUMBNAIL_WIDTH),
      selected: selectedPhotosById.has(file.id)
    }));
    photos.push(...newPhotos);
    nextPageToken = data.nextPageToken || null;

    if (shouldRender && isAppending) {
      gallery.querySelector(".load-more")?.remove();
      gallery.insertAdjacentHTML("beforeend", newPhotos.map(photoCardMarkup).join(""));
      if (nextPageToken) {
        gallery.insertAdjacentHTML("beforeend", `<button class="load-more" type="button">Load More</button>`);
      }
      updateCounts();
    }
  } catch (error) {
    gallery.innerHTML = `${folderTitleMarkup()}<p class="gallery-message">The photos could not be loaded. Confirm that the folder and its images are public and that the Drive API key is valid.<br><small>${error.message}</small></p>`;
    loading = false;
    return false;
  }

  loading = false;
  if (shouldRender && !isAppending) {
    renderGallery();
  }
  return true;
}

async function loadDriveFolder(folderId) {
  currentDriveFolderId = folderId;
  updateBottomFolderIcon();
  photos.length = 0;
  driveFolders.length = 0;
  nextPageToken = null;
  totalDrivePhotos = null;
  currentPhotoIndex = -1;
  loading = false;

  const cached = folderCache.get(folderId);
  if (cached) {
    if (!driveFolderNames.has(folderId)) await fetchDriveFolderName(folderId);
    driveFolders.push(...cached.folders);
    photos.push(...cached.photos.map(photo => ({
      ...photo,
      selected: selectedPhotosById.has(photo.id)
    })));
    nextPageToken = cached.nextPageToken;
    renderGallery(true);
    cached.folders.forEach(folder => preloadDriveFolder(folder.id));
    countDrivePhotos(folderId);
    return;
  }

  gallery.innerHTML = `${folderTitleMarkup()}
    <div class="folder-loading" role="status" aria-live="polite">
      <span aria-hidden="true"></span>
      <p>Opening folder…</p>
    </div>`;

  await Promise.all([
    fetchDriveFolderName(folderId),
    fetchDriveFolders(folderId, false),
    fetchDrivePhotos("", folderId, false)
  ]);
  folderCache.set(folderId, {
    folders: driveFolders.map(folder => ({ ...folder })),
    photos: photos.map(({ id, name, src }) => ({ id, name, src })),
    nextPageToken
  });
  renderGallery(true);
  countDrivePhotos(folderId);
}

gallery.addEventListener("click", event => {
  if (event.target.closest(".load-more")) {
    fetchDrivePhotos(nextPageToken, currentDriveFolderId);
    return;
  }

  const folderCard = event.target.closest(".folder-card");
  if (folderCard) {
    cacheCurrentFolder();
    folderHistory.push({ id: currentDriveFolderId });
    const folderId = folderCard.dataset.folderId;
    const folder = driveFolders.find(item => item.id === folderId);
    if (folder?.name) driveFolderNames.set(folderId, folder.name);
    window.history.pushState({
      galleryFolderId: folderId,
      folderTrail: folderHistory.map(folder => folder.id)
    }, "");
    loadDriveFolder(folderId);
    return;
  }

  const clickedImage = event.target.closest(".photo-wrap img");
  if (clickedImage) {
    const card = clickedImage.closest(".photo-card");
    lightboxPhotoList = currentFilter === "selected" ? [...selectedPhotosById.values()] : photos;
    const photo = lightboxPhotoList.find(item => item.id === card.dataset.id);
    if (!photo) return;
    currentPhotoIndex = lightboxPhotoList.indexOf(photo);
    updateLightbox();
    lightbox.showModal();
    document.body.classList.add("lightbox-open");
    return;
  }

  const heartButton = event.target.closest(".heart");
  if (!heartButton) return;
  const card = heartButton.closest(".photo-card");
  const photo = photos.find(item => item.id === card.dataset.id) || selectedPhotosById.get(card.dataset.id);
  if (!photo) return;
  photo.selected = !photo.selected;
  if (photo.selected) selectedPhotosById.set(photo.id, photo);
  else selectedPhotosById.delete(photo.id);
  const showLimitWarning = photo.selected && selectedPhotosById.size === SELECTION_LIMIT + 1;

  if (currentFilter === "selected" && !photo.selected) {
    animateSelectionRemoval(card);
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

bottomFolderBack.addEventListener("pointerdown", () => {
  bottomFolderBack.classList.add("pressing");
});

["pointerup", "pointercancel", "pointerleave"].forEach(eventName => {
  bottomFolderBack.addEventListener(eventName, () => {
    bottomFolderBack.classList.remove("pressing");
  });
});

bottomFolderBack.addEventListener("click", () => {
  if (currentFilter === "selected") {
    currentFilter = "all";
    filters.forEach(button => {
      const isActive = button.dataset.filter === "all";
      button.classList.toggle("active", isActive);
      button.disabled = isActive;
    });
    document.querySelector(".filter-control").classList.remove("selections-active");
    folderHistory.length = 0;
    window.history.replaceState({
      galleryFolderId: DRIVE_FOLDER_ID,
      folderTrail: []
    }, "");

    if (currentDriveFolderId === DRIVE_FOLDER_ID) renderGallery(true);
    else loadDriveFolder(DRIVE_FOLDER_ID);
    return;
  }

  if (!folderHistory.length) return;

  const parent = folderHistory.pop();
  suppressNextFolderPop = true;
  loadDriveFolder(parent.id);
  window.history.back();
});

window.addEventListener("popstate", event => {
  if (suppressNextFolderPop) {
    suppressNextFolderPop = false;
    return;
  }

  const state = event.state;
  if (!state?.galleryFolderId) return;

  folderHistory.length = 0;
  folderHistory.push(...(state.folderTrail || []).map(id => ({ id })));
  loadDriveFolder(state.galleryFolderId);
});

lightboxHeart.addEventListener("click", () => {
  const photo = lightboxPhotoList[currentPhotoIndex];
  if (!photo) return;
  photo.selected = !photo.selected;
  if (photo.selected) selectedPhotosById.set(photo.id, photo);
  else selectedPhotosById.delete(photo.id);
  const showLimitWarning = photo.selected && selectedPhotosById.size === SELECTION_LIMIT + 1;
  lightboxHeart.setAttribute("aria-pressed", String(photo.selected));
  lightboxHeart.setAttribute("aria-label", `${photo.selected ? "Remove from" : "Add to"} selections`);

  const card = gallery.querySelector(`[data-id="${CSS.escape(photo.id)}"]`);
  if (card) {
    if (currentFilter === "selected" && !photo.selected) {
      animateSelectionRemoval(card);
    } else {
      card.classList.toggle("selected", photo.selected);
      const cardHeart = card.querySelector(".heart");
      cardHeart.setAttribute("aria-pressed", String(photo.selected));
      cardHeart.setAttribute("aria-label", `${photo.selected ? "Remove from" : "Add to"} selections`);
    }
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
  if (currentPhotoIndex < lightboxPhotoList.length - 1) {
    currentPhotoIndex += 1;
    updateLightbox();
    return;
  }

  if (nextPageToken) {
    nextPhoto.disabled = true;
    const previousLength = photos.length;
    const loaded = await fetchDrivePhotos(nextPageToken, currentDriveFolderId);
    if (loaded && photos.length > previousLength) {
      lightboxPhotoList = photos;
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
  if (button.dataset.filter === currentFilter) return;
  const preservedScrollY = window.scrollY;
  currentFilter = button.dataset.filter;
  updateBottomFolderIcon();
  filters.forEach(item => {
    const isActive = item === button;
    item.classList.toggle("active", isActive);
    item.disabled = isActive;
  });
  document.querySelector(".filter-control").classList.toggle("selections-active", currentFilter === "selected");
  gallery.style.removeProperty("min-height");
  renderGallery(true);
  const maximumScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
  window.scrollTo(0, Math.min(preservedScrollY, maximumScroll));
}));

filters.forEach(button => {
  button.disabled = button.dataset.filter === currentFilter;
});

document.querySelector(".header-submit").addEventListener("click", () => {
  const selectedPhotos = [...selectedPhotosById.values()];
  summaryAlbum.textContent = albumSelectButton.querySelector("span").textContent;
  summaryCount.textContent = selectedPhotos.length;
  summaryLimit.textContent = SELECTION_LIMIT;
  summaryLimitTotal.textContent = SELECTION_LIMIT;
  selectionProgress.setAttribute("aria-valuemax", String(SELECTION_LIMIT));
  selectionProgress.setAttribute("aria-valuenow", String(selectedPhotos.length));
  selectionProgress.classList.toggle("limit-reached", selectedPhotos.length === SELECTION_LIMIT);
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
    detail: { photos: [...selectedPhotosById.values()] }
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

loadDriveFolder(DRIVE_FOLDER_ID);

document.addEventListener("contextmenu", event => event.preventDefault());
document.addEventListener("dragstart", event => {
  if (event.target instanceof HTMLImageElement) event.preventDefault();
});
