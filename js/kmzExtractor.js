/**
 * KMZ Extractor - Module untuk mengekstrak foto dari file KMZ
 */
class KMZExtractor {
  constructor() {
    this.jszip = new JSZip();
    this.kmlContent = null;
    this.placemarks = [];
    this.extractedImages = [];
    this.warnings = [];
    this.logs = [];
    this.parser = new DOMParser();
  }

  /**
   * Memproses file KMZ yang diunggah
   * @param {File} file - File KMZ yang diunggah
   * @param {Object} options - Opsi ekstraksi
   * @returns {Promise} - Promise yang menyelesaikan proses ekstraksi foto
   */
  async extractImagesFromKMZ(file, options) {
    try {
      this.warnings = [];
      this.logs = [];
      this.extractedImages = [];

      // Reset status
      this.logs.push({
        status: "info",
        message: `Memulai ekstraksi foto dari ${file.name}`,
      });

      // Load dan ekstrak KMZ
      const zipContent = await this.jszip.loadAsync(file);

      // Temukan file KML dalam arsip KMZ
      let kmlFile = null;
      let filesInKmz = [];

      // Cari file KML dan buat daftar semua file dalam KMZ
      for (const filename in zipContent.files) {
        if (!zipContent.files[filename].dir) {
          filesInKmz.push(filename);

          if (filename.toLowerCase().endsWith(".kml")) {
            kmlFile = zipContent.files[filename];
          }
        }
      }

      if (!kmlFile) {
        throw new Error("Tidak dapat menemukan file KML dalam KMZ");
      }

      // Baca konten KML
      const kmlString = await kmlFile.async("text");
      this.kmlContent = this.parser.parseFromString(kmlString, "application/xml");

      // Proses placemarks dari KML dan ekstrak info gambar
      await this.processKMLAndExtractImages(zipContent, filesInKmz, options);

      // Catat hasil ekstraksi
      this.logs.push({
        status: "success",
        message: `Berhasil mengekstrak ${this.extractedImages.length} foto dari file KMZ`,
      });

      // Buat file ZIP dengan foto yang diekstrak
      const outputZip = await this.createOutputZip();

      return {
        totalPlacemarks: this.placemarks.length,
        totalPhotos: this.extractedImages.length,
        warnings: this.warnings,
        logs: this.logs,
        outputZip: outputZip,
      };
    } catch (error) {
      console.error("Error saat mengekstrak foto dari KMZ:", error);
      this.warnings.push("Error: " + error.message);
      throw error;
    }
  }

  /**
   * Memproses KML dan langsung mengekstrak gambar
   * @param {Object} zipContent - Konten ZIP dari KMZ
   * @param {Array} filesInKmz - Daftar file dalam KMZ
   * @param {Object} options - Opsi ekstraksi
   */
  async processKMLAndExtractImages(zipContent, filesInKmz, options) {
    this.placemarks = [];
    const filterPlacemarks = !options.extractAllImages;

    // Temukan semua Placemarks dalam KML
    const placemarkElements = this.kmlContent.getElementsByTagName("Placemark");

    // Proses setiap placemark
    for (let i = 0; i < placemarkElements.length; i++) {
      const placemark = placemarkElements[i];

      // Ekstrak nama placemark
      const nameElement = placemark.getElementsByTagName("name")[0];
      if (!nameElement) continue;

      const placemarkName = nameElement.textContent.trim();

      // Filter jika perlu
      if (filterPlacemarks && !placemarkName.startsWith("?-")) continue;

      // Tambahkan ke daftar placemarks
      this.placemarks.push({
        name: placemarkName,
        element: placemark,
      });

      // Cari gambar dalam berbagai lokasi
      let imageRefs = [];

      // 1. Cek dalam tag description
      const descElements = placemark.getElementsByTagName("description");
      if (descElements.length > 0) {
        const description = descElements[0].innerHTML || descElements[0].textContent;
        imageRefs = [...imageRefs, ...this.extractImageReferencesFromHTML(description)];
      }

      // 2. Cek dalam ExtendedData > Data[name="pictures"]
      const extendedDataElements = placemark.getElementsByTagName("ExtendedData");
      if (extendedDataElements.length > 0) {
        const dataElements = extendedDataElements[0].getElementsByTagName("Data");
        for (let j = 0; j < dataElements.length; j++) {
          const dataElement = dataElements[j];
          if (dataElement.getAttribute("name") === "pictures") {
            const valueElements = dataElement.getElementsByTagName("value");
            if (valueElements.length > 0) {
              const pictureValue = valueElements[0].innerHTML || valueElements[0].textContent;
              const pictureRefs = this.extractImageReferencesFromHTML(pictureValue);
              imageRefs = [...imageRefs, ...pictureRefs];
            }
          }
        }
      }

      // Jika tidak ada gambar ditemukan, lanjutkan ke placemark berikutnya
      if (imageRefs.length === 0) continue;

      // Proses setiap referensi gambar
      for (const imgRef of imageRefs) {
        // Lewati URL online
        if (imgRef.startsWith("http://") || imgRef.startsWith("https://")) continue;

        // Proses referensi lokal atau data URL
        if (imgRef.startsWith("data:")) {
          // Handle data URL (base64)
          await this.extractBase64Image(imgRef, placemarkName, options.keepStructure);
        } else {
          // Handle file lokal - cari file dalam KMZ
          const normalizedRef = this.normalizeFilePath(imgRef);
          let foundFile = false;

          // Coba cari file dengan nama persis
          for (const filename of filesInKmz) {
            const normalizedFilename = this.normalizeFilePath(filename);

            // Bandingkan nama file atau akhir path
            if (normalizedFilename === normalizedRef || normalizedFilename.endsWith("/" + normalizedRef) || normalizedRef === normalizedFilename.split("/").pop()) {
              // Ekstrak file menggunakan nama placemark
              await this.extractFileFromKMZ(zipContent, filename, placemarkName, options.keepStructure);
              foundFile = true;
              break;
            }
          }

          if (!foundFile) {
            this.logs.push({
              status: "warning",
              message: `Tidak menemukan file "${imgRef}" dalam KMZ untuk placemark "${placemarkName}"`,
            });
          }
        }
      }
    }

    // Log jumlah placemark
    this.logs.push({
      status: "info",
      message: `Ditemukan ${this.placemarks.length} placemark dalam KMZ`,
    });
  }

  /**
   * Ekstrak referensi gambar dari HTML
   * @param {String} html - String HTML
   * @returns {Array} - Array referensi gambar
   */
  extractImageReferencesFromHTML(html) {
    const references = [];

    // Cari tag img
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let match;

    while ((match = imgRegex.exec(html)) !== null) {
      if (match[1]) {
        references.push(match[1]);
      }
    }

    // Jika tidak ditemukan, cari referensi base64
    if (references.length === 0) {
      const base64Regex = /data:image\/[^;]+;base64,([^"']+)/gi;
      while ((match = base64Regex.exec(html)) !== null) {
        if (match[0]) {
          references.push(match[0]);
        }
      }
    }

    return references;
  }

  /**
   * Normalisasi path file
   * @param {String} path - Path file
   * @returns {String} - Path yang dinormalisasi
   */
  normalizeFilePath(path) {
    // Hapus parameter URL jika ada
    let normalizedPath = path.split("?")[0];

    // Hapus hash jika ada
    normalizedPath = normalizedPath.split("#")[0];

    // Hapus slash di awal jika ada
    if (normalizedPath.startsWith("/")) {
      normalizedPath = normalizedPath.substring(1);
    }

    return normalizedPath;
  }

  /**
   * Ekstrak gambar base64 dari string
   * @param {String} dataUrl - String data URL
   * @param {String} placemarkName - Nama placemark
   * @param {Boolean} keepStructure - Apakah pertahankan struktur nama
   */
  async extractBase64Image(dataUrl, placemarkName, keepStructure) {
    try {
      // Ekstrak tipe MIME dan data
      const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);

      if (!matches || matches.length !== 3) {
        this.logs.push({
          status: "warning",
          message: `Format data URL tidak valid untuk placemark "${placemarkName}"`,
        });
        return;
      }

      const mimeType = matches[1];
      const base64Data = matches[2];

      // Tentukan ekstensi file berdasarkan MIME
      let extension = ".jpg"; // Default
      if (mimeType.includes("png")) extension = ".png";
      else if (mimeType.includes("gif")) extension = ".gif";
      else if (mimeType.includes("jpeg")) extension = ".jpg";
      else if (mimeType.includes("webp")) extension = ".webp";
      else if (mimeType.includes("bmp")) extension = ".bmp";

      // Buat nama file langsung dari nama placemark
      const fileName = this.generateFileNameFromPlacemark(placemarkName, extension, keepStructure);

      // Tambahkan ke daftar gambar yang diekstrak
      this.extractedImages.push({
        name: fileName,
        data: base64Data,
        mimeType: mimeType,
      });

      this.logs.push({
        status: "success",
        message: `Berhasil mengekstrak gambar base64 dari placemark "${placemarkName}" sebagai "${fileName}"`,
      });
    } catch (error) {
      this.logs.push({
        status: "error",
        message: `Error saat mengekstrak gambar base64 dari placemark "${placemarkName}": ${error.message}`,
      });
    }
  }

  /**
   * Ekstrak file dari KMZ
   * @param {Object} zipContent - Konten ZIP dari KMZ
   * @param {String} filePath - Path file dalam KMZ
   * @param {String} placemarkName - Nama placemark
   * @param {Boolean} keepStructure - Apakah pertahankan struktur nama
   */
  async extractFileFromKMZ(zipContent, filePath, placemarkName, keepStructure) {
    try {
      // Dapatkan file dari KMZ
      const file = zipContent.files[filePath];

      if (!file) {
        this.logs.push({
          status: "warning",
          message: `File "${filePath}" tidak ditemukan dalam KMZ`,
        });
        return;
      }

      // Baca konten file
      const content = await file.async("base64");

      // Tentukan ekstensi file
      const extension = filePath.split(".").pop().toLowerCase();

      // Buat nama file berdasarkan nama placemark - ini adalah kuncinya!
      const fileName = this.generateFileNameFromPlacemark(placemarkName, "." + extension, keepStructure);

      // Cek apakah file ini sudah diekstrak
      const isDuplicate = this.extractedImages.some((img) => img.name === fileName);
      if (isDuplicate) {
        this.logs.push({
          status: "warning",
          message: `File "${fileName}" sudah diekstrak sebelumnya, melewati...`,
        });
        return;
      }

      // Tambahkan ke daftar gambar yang diekstrak
      this.extractedImages.push({
        name: fileName,
        data: content,
        originalFile: filePath,
      });

      this.logs.push({
        status: "success",
        message: `Berhasil mengekstrak file "${filePath}" dari KMZ sebagai "${fileName}"`,
      });
    } catch (error) {
      this.logs.push({
        status: "error",
        message: `Error saat mengekstrak file "${filePath}" dari KMZ: ${error.message}`,
      });
    }
  }

  /**
   * Membuat nama file berdasarkan nama placemark
   * @param {String} placemarkName - Nama placemark
   * @param {String} extension - Ekstensi file
   * @param {Boolean} keepStructure - Apakah pertahankan struktur nama
   * @returns {String} - Nama file yang dibuat
   */
  generateFileNameFromPlacemark(placemarkName, extension, keepStructure) {
    // Bersihkan nama placemark, hapus karakter yang tidak valid untuk nama file
    let cleanName = placemarkName.replace(/[<>:"/\\|*]/g, "-?");

    // Jika tidak perlu pertahankan struktur "?-", hapus dari nama
    if (!keepStructure && cleanName.startsWith("?-")) {
      cleanName = cleanName.substring(2);
    }

    // Pastikan ekstensi dimulai dengan titik
    if (!extension.startsWith(".")) {
      extension = "." + extension;
    }

    return cleanName + extension;
  }

  /**
   * Membuat file ZIP dari gambar yang diekstrak
   * @returns {Promise<Blob>} - Blob ZIP
   */
  async createOutputZip() {
    // Buat instance JSZip baru
    const outputZip = new JSZip();

    // Tambahkan semua gambar ke ZIP
    for (const image of this.extractedImages) {
      outputZip.file(image.name, image.data, {base64: true});
    }

    // Hasilkan file ZIP
    return await outputZip.generateAsync({type: "blob"});
  }
}
