/**
 * Main.js - Mengontrol logika aplikasi dan interaksi pengguna
 * untuk KMZ Photo Extractor
 */

// Deklarasi variabel global
let kmzFile = null;
let kmzExtractor = null;
let extractionResult = null;

// Element selectors
const elements = {
  // File upload elements
  kmzUpload: document.getElementById("kmz-upload"),
  kmzFileInput: document.getElementById("kmz-file"),
  kmzBrowseBtn: document.getElementById("kmz-browse-btn"),
  kmzFileInfo: document.getElementById("kmz-file-info"),
  kmzFilename: document.getElementById("kmz-filename"),
  kmzFilesize: document.getElementById("kmz-filesize"),
  kmzRemoveBtn: document.getElementById("kmz-remove-btn"),

  // Option elements
  keepStructure: document.getElementById("keep-structure"),
  extractAllImages: document.getElementById("extract-all-images"),

  // Process elements
  processBtn: document.getElementById("process-btn"),
  warningContainer: document.getElementById("warning-container"),

  // Result elements
  resultArea: document.getElementById("result-area"),
  totalPlacemarks: document.getElementById("total-placemarks"),
  totalPhotos: document.getElementById("total-photos"),
  resultLogs: document.getElementById("result-logs"),
  downloadBtn: document.getElementById("download-btn"),

  // Modal elements
  notificationModal: document.getElementById("notification-modal"),
  modalTitle: document.getElementById("modal-title"),
  modalMessage: document.getElementById("modal-message"),
  modalOkBtn: document.getElementById("modal-ok-btn"),
  closeModal: document.querySelector(".close-modal"),

  // Loading overlay
  loadingOverlay: document.getElementById("loading-overlay"),
};

// Inisialisasi aplikasi
document.addEventListener("DOMContentLoaded", init);

/**
 * Inisialisasi aplikasi
 */
function init() {
  // Inisialisasi kelas extractor
  kmzExtractor = new KMZExtractor();

  // Pasang event listeners
  setupEventListeners();
}

/**
 * Mengatur event listeners untuk semua interaksi pengguna
 */
function setupEventListeners() {
  // File Upload KMZ
  elements.kmzBrowseBtn.addEventListener("click", () => elements.kmzFileInput.click());
  elements.kmzFileInput.addEventListener("change", handleKmzFileSelect);
  elements.kmzRemoveBtn.addEventListener("click", removeKmzFile);
  elements.kmzUpload.addEventListener("dragover", handleDragOver);
  elements.kmzUpload.addEventListener("dragleave", handleDragLeave);
  elements.kmzUpload.addEventListener("drop", handleKmzFileDrop);

  // Process Button
  elements.processBtn.addEventListener("click", processExtraction);

  // Download Button
  elements.downloadBtn.addEventListener("click", downloadResult);

  // Modal
  elements.modalOkBtn.addEventListener("click", closeModal);
  elements.closeModal.addEventListener("click", closeModal);
}

/**
 * Menangani saat file KMZ dipilih melalui dialog
 * @param {Event} event - Event file input change
 */
function handleKmzFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    processKmzFile(file);
  }
}

/**
 * Menangani drag over pada area drop
 * @param {Event} event - Event drag over
 */
function handleDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  this.classList.add("drag-over");
}

/**
 * Menangani drag leave pada area drop
 * @param {Event} event - Event drag leave
 */
function handleDragLeave(event) {
  event.preventDefault();
  event.stopPropagation();
  this.classList.remove("drag-over");
}

/**
 * Menangani drop file KMZ
 * @param {Event} event - Event drop
 */
function handleKmzFileDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  this.classList.remove("drag-over");

  const file = event.dataTransfer.files[0];
  if (file && file.name.toLowerCase().endsWith(".kmz")) {
    processKmzFile(file);
  } else {
    showNotification("Error", "Silakan unggah file KMZ yang valid.");
  }
}

/**
 * Memproses file KMZ yang diunggah
 * @param {File} file - File KMZ yang dipilih
 */
function processKmzFile(file) {
  if (!file.name.toLowerCase().endsWith(".kmz")) {
    showNotification("Error", "Silakan unggah file dengan ekstensi .kmz");
    return;
  }

  try {
    // Tampilkan informasi file
    kmzFile = file;
    elements.kmzFilename.textContent = file.name;
    elements.kmzFilesize.textContent = formatFileSize(file.size);
    elements.kmzFileInfo.style.display = "flex";
    elements.kmzUpload.querySelector(".file-upload-content").style.display = "none";

    // Update status tombol proses
    elements.processBtn.disabled = false;
  } catch (error) {
    console.error("Error saat memproses file KMZ:", error);
    showNotification("Error", "Gagal memproses file KMZ: " + error.message);
  }
}

/**
 * Menghapus file KMZ
 */
function removeKmzFile() {
  kmzFile = null;
  elements.kmzFileInput.value = "";
  elements.kmzFileInfo.style.display = "none";
  elements.kmzUpload.querySelector(".file-upload-content").style.display = "block";
  elements.processBtn.disabled = true;
}

/**
 * Memproses ekstraksi foto dari KMZ
 */
async function processExtraction() {
  try {
    // Tampilkan loading overlay
    showLoading(true);

    // Bersihkan warning dan tampilan hasil sebelumnya
    elements.warningContainer.innerHTML = "";
    elements.resultLogs.innerHTML = "";
    elements.resultArea.style.display = "none";

    // Dapatkan opsi ekstraksi
    const options = {
      keepStructure: elements.keepStructure.checked,
      extractAllImages: elements.extractAllImages.checked,
      filterPlacemarks: !elements.extractAllImages.checked, // Jika extract all, tidak perlu filter
    };

    // Ekstrak foto dari KMZ
    extractionResult = await kmzExtractor.extractImagesFromKMZ(kmzFile, options);

    // Tampilkan warning dari ekstraksi
    displayWarnings(extractionResult.warnings);

    // Tampilkan logs
    displayLogs(extractionResult.logs);

    // Tampilkan hasil
    elements.totalPlacemarks.textContent = extractionResult.totalPlacemarks;
    elements.totalPhotos.textContent = extractionResult.totalPhotos;
    elements.resultArea.style.display = "block";

    // Scroll ke area hasil
    elements.resultArea.scrollIntoView({behavior: "smooth"});
  } catch (error) {
    console.error("Error saat mengekstrak foto:", error);
    showNotification("Error", "Gagal mengekstrak foto: " + error.message);
  } finally {
    // Sembunyikan loading overlay
    showLoading(false);
  }
}

/**
 * Menampilkan warning dari proses
 * @param {Array} warnings - Array pesan warning
 */
function displayWarnings(warnings) {
  if (!warnings || warnings.length === 0) return;

  for (const warning of warnings) {
    const warningElement = document.createElement("div");
    warningElement.className = "warning";
    warningElement.innerHTML = `
            <i class="fas fa-exclamation-triangle"></i>
            <p>${warning}</p>
        `;
    elements.warningContainer.appendChild(warningElement);
  }
}

/**
 * Menampilkan log dari proses ekstraksi
 * @param {Array} logs - Array log proses
 */
function displayLogs(logs) {
  if (!logs || logs.length === 0) return;

  for (const log of logs) {
    const logElement = document.createElement("div");
    logElement.className = `log-item log-${log.status}`;
    logElement.textContent = log.message;
    elements.resultLogs.appendChild(logElement);
  }
}

/**
 * Download hasil ekstraksi
 */
async function downloadResult() {
  try {
    showLoading(true);

    // Periksa apakah ada hasil ekstraksi
    if (!extractionResult || !extractionResult.outputZip) {
      throw new Error("Tidak ada hasil ekstraksi untuk diunduh");
    }

    // Buat URL untuk download
    const downloadUrl = URL.createObjectURL(extractionResult.outputZip);

    // Buat element a untuk download
    const downloadLink = document.createElement("a");
    downloadLink.href = downloadUrl;

    // Buat nama file baru
    const originalName = kmzFile.name;
    const nameParts = originalName.split(".");
    nameParts.pop(); // Hapus ekstensi
    const baseName = nameParts.join(".");
    const newFileName = `${baseName}_extracted_photos.zip`;

    downloadLink.download = newFileName;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    // Pembersihan
    URL.revokeObjectURL(downloadUrl);

    // Tampilkan notifikasi sukses
    showNotification("Sukses", "Foto yang diekstrak berhasil diunduh.");
  } catch (error) {
    console.error("Error saat mengunduh hasil:", error);
    showNotification("Error", "Gagal mengunduh hasil: " + error.message);
  } finally {
    showLoading(false);
  }
}

/**
 * Format ukuran file ke bentuk yang mudah dibaca
 * @param {Number} bytes - Ukuran file dalam bytes
 * @returns {String} - Ukuran file yang diformat
 */
function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Menampilkan modal notifikasi
 * @param {String} title - Judul notifikasi
 * @param {String} message - Pesan notifikasi
 */
function showNotification(title, message) {
  elements.modalTitle.textContent = title;
  elements.modalMessage.textContent = message;
  elements.notificationModal.classList.add("show");
}

/**
 * Menutup modal notifikasi
 */
function closeModal() {
  elements.notificationModal.classList.remove("show");
}

/**
 * Menampilkan atau menyembunyikan loading overlay
 * @param {Boolean} show - Flag untuk menampilkan atau menyembunyikan
 */
function showLoading(show) {
  if (show) {
    elements.loadingOverlay.classList.add("show");
  } else {
    elements.loadingOverlay.classList.remove("show");
  }
}
