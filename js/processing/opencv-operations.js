/* Meow module: Individual OpenCV.js image-processing operations.
 * Loaded as a classic script in the order listed in index.html.
 * Shared globals are preserved during this behavior-preserving extraction.
 */
function processOpenCVBlock(src, type, params = {}) {
  // Track all OpenCV-owned wrappers created by this operation. The returned dst is
  // handed to the pipeline; all temporary Mats/vectors/algorithms are released here.
  const allocations = [];
  const own = (resource) => {
    if (resource && typeof resource.delete === 'function') allocations.push(resource);
    return resource;
  };
  const mat = () => own(new cv.Mat());
  const zeros = (rows, cols, typeCode) => own(cv.Mat.zeros(rows, cols, typeCode));
  const ones = (rows, cols, typeCode) => own(cv.Mat.ones(rows, cols, typeCode));
  const vector = () => own(new cv.MatVector());
  const size = (width, height) => own(new cv.Size(width, height));
  const point = (x, y) => own(new cv.Point(x, y));
  const rect = (x, y, width, height) => own(new cv.Rect(x, y, width, height));
  const scalar = (...values) => own(new cv.Scalar(...values));
  let dst = mat();
  let completed = false;

  try {
    if (type === 'grayscale') {
      const gray = mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.cvtColor(gray, dst, cv.COLOR_GRAY2RGBA, 0);
    } else if (type === 'invert') {
      cv.bitwise_not(src, dst);
      // Inverting the alpha channel makes otherwise opaque exports transparent.
      for (let r = 0; r < dst.rows; r++) {
        const sourceRow = src.ucharPtr(r);
        const outputRow = dst.ucharPtr(r);
        for (let c = 0; c < dst.cols; c++) outputRow[c * 4 + 3] = sourceRow[c * 4 + 3];
      }
    } else if (type === 'brightContrast') {
      src.convertTo(dst, -1, Number(params.contrast ?? 1), Number(params.brightness ?? 0));
      for (let r = 0; r < dst.rows; r++) {
        const sourceRow = src.ucharPtr(r);
        const outputRow = dst.ucharPtr(r);
        for (let c = 0; c < dst.cols; c++) outputRow[c * 4 + 3] = sourceRow[c * 4 + 3];
      }
    } else if (type === 'gamma') {
      const gamma = Math.max(0.1, Number(params.gamma) || 1);
      const lut = mat();
      lut.create(1, 256, cv.CV_8UC1);
      for (let i = 0; i < 256; i++) lut.ucharPtr(0)[i] = clamp(Math.round(255 * Math.pow(i / 255, 1 / gamma)));
      // Apply the lookup to RGB only so source alpha is preserved.
      src.copyTo(dst);
      for (let r = 0; r < src.rows; r++) {
        const row = dst.ucharPtr(r);
        for (let c = 0; c < src.cols; c++) {
          for (let ch = 0; ch < 3; ch++) row[c * 4 + ch] = lut.ucharPtr(0)[row[c * 4 + ch]];
        }
      }
    } else if (type === 'histEq') {
      const gray = mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.equalizeHist(gray, gray);
      cv.cvtColor(gray, dst, cv.COLOR_GRAY2RGBA, 0);
    } else if (type === 'clahe') {
      const gray = mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      const clahe = own(new cv.CLAHE(Number(params.clipLimit) || 2, size(Number(params.tileSize) || 8, Number(params.tileSize) || 8)));
      clahe.apply(gray, gray);
      cv.cvtColor(gray, dst, cv.COLOR_GRAY2RGBA, 0);
    } else if (type === 'gaussianBlur') {
      const kernel = Math.max(1, Number(params.kernel) || 5) | 1;
      cv.GaussianBlur(src, dst, size(kernel, kernel), Number(params.sigma) || 0, Number(params.sigma) || 0, cv.BORDER_DEFAULT);
    } else if (type === 'medianBlur') {
      const kernel = Math.max(3, Number(params.kernel) || 3) | 1;
      cv.medianBlur(src, dst, kernel);
    } else if (type === 'sharpen') {
      const blur = mat();
      cv.GaussianBlur(src, blur, size(0, 0), 2);
      const amount = Math.max(0.1, Number(params.amount) || 1);
      cv.addWeighted(src, 1 + amount, blur, -amount, 0, dst);
    } else if (type === 'sobel') {
      const gray = mat();
      const gradient16 = mat();
      const gradient8 = mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      const ksize = Number(params.ksize) || 3;
      cv.Sobel(gray, gradient16, cv.CV_16S, Number(params.dx) || 0, Number(params.dy) || 0, ksize, 1, 0, cv.BORDER_DEFAULT);
      cv.convertScaleAbs(gradient16, gradient8);
      cv.cvtColor(gradient8, dst, cv.COLOR_GRAY2RGBA, 0);
    } else if (type === 'canny') {
      const gray = mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.Canny(gray, gray, Number(params.t1 ?? 50), Number(params.t2 ?? 150), 3, false);
      cv.cvtColor(gray, dst, cv.COLOR_GRAY2RGBA, 0);
    } else if (type === 'morphology') {
      let shape = cv.MORPH_RECT;
      if (params.shape === 'Cross') shape = cv.MORPH_CROSS;
      else if (params.shape === 'Ellipse') shape = cv.MORPH_ELLIPSE;
      const operations = {
        'Erode': cv.MORPH_ERODE, 'Dilate': cv.MORPH_DILATE, 'Open': cv.MORPH_OPEN,
        'Close': cv.MORPH_CLOSE, 'Gradient': cv.MORPH_GRADIENT, 'Top Hat': cv.MORPH_TOPHAT,
        'Black Hat': cv.MORPH_BLACKHAT
      };
      const kernelSize = Math.max(1, Number(params.ksize) || 3) | 1;
      const kernel = own(cv.getStructuringElement(shape, size(kernelSize, kernelSize)));
      cv.morphologyEx(src, dst, operations[params.op] ?? cv.MORPH_OPEN, kernel, point(-1, -1), Math.max(1, Number(params.iters) || 1), cv.BORDER_CONSTANT, own(cv.morphologyDefaultBorderValue()));
    } else if (type === 'threshold') {
      const gray = mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      const thresholdTypes = {
        'Binary': cv.THRESH_BINARY, 'Binary Inv': cv.THRESH_BINARY_INV, 'Trunc': cv.THRESH_TRUNC,
        'ToZero': cv.THRESH_TOZERO, 'ToZero Inv': cv.THRESH_TOZERO_INV
      };
      let thresholdType = thresholdTypes[params.type] ?? cv.THRESH_BINARY;
      if (params.type === 'Otsu') thresholdType = cv.THRESH_BINARY | cv.THRESH_OTSU;
      cv.threshold(gray, gray, Number(params.level) || 0, 255, thresholdType);
      cv.cvtColor(gray, dst, cv.COLOR_GRAY2RGBA, 0);
    } else if (type === 'distTransform') {
      const gray = mat();
      const distance = mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.threshold(gray, gray, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
      cv.distanceTransform(gray, distance, cv.DIST_L2, 5);
      cv.normalize(distance, distance, 0, 255, cv.NORM_MINMAX, cv.CV_8UC1);
      cv.cvtColor(distance, dst, cv.COLOR_GRAY2RGBA, 0);
    } else if (type === 'connectedComps') {
      const gray = mat();
      const labels = mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.threshold(gray, gray, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
      const count = cv.connectedComponents(gray, labels, 8, cv.CV_32S);
      dst = zeros(src.rows, src.cols, cv.CV_8UC4);
      const colors = Array.from({ length: count }, (_, index) => index === 0 ? [0, 0, 0, 255] : [Math.random() * 255, Math.random() * 255, Math.random() * 255, 255]);
      for (let r = 0; r < dst.rows; r++) {
        const output = dst.ucharPtr(r);
        for (let c = 0; c < dst.cols; c++) {
          const label = labels.intPtr(r, c)[0];
          const color = colors[label] || [255, 255, 255, 255];
          const offset = c * 4;
          output[offset] = color[0]; output[offset + 1] = color[1]; output[offset + 2] = color[2]; output[offset + 3] = 255;
        }
      }
    } else if (type === 'watershed') {
      const colorImage = mat();
      const gray = mat();
      const threshold = mat();
      const kernel = ones(3, 3, cv.CV_8U);
      const opening = mat();
      const sureBackground = mat();
      const distance = mat();
      const sureForeground = mat();
      const unknown = mat();
      const markers = mat();
      const markerOffset = ones(src.rows, src.cols, cv.CV_32S);
      cv.cvtColor(src, colorImage, cv.COLOR_RGBA2RGB);
      cv.cvtColor(colorImage, gray, cv.COLOR_RGB2GRAY);
      cv.threshold(gray, threshold, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);
      cv.morphologyEx(threshold, opening, cv.MORPH_OPEN, kernel, point(-1, -1), 2);
      cv.dilate(opening, sureBackground, kernel, point(-1, -1), 3);
      cv.distanceTransform(opening, distance, cv.DIST_L2, 5);
      const minMax = cv.minMaxLoc(distance);
      cv.threshold(distance, sureForeground, 0.5 * minMax.maxVal, 255, 0);
      sureForeground.convertTo(sureForeground, cv.CV_8U);
      cv.subtract(sureBackground, sureForeground, unknown);
      cv.connectedComponents(sureForeground, markers);
      cv.add(markers, markerOffset, markers);
      for (let r = 0; r < markers.rows; r++) {
        for (let c = 0; c < markers.cols; c++) {
          if (unknown.ucharPtr(r, c)[0] === 255) markers.intPtr(r, c)[0] = 0;
        }
      }
      cv.watershed(colorImage, markers);
      dst = zeros(src.rows, src.cols, cv.CV_8UC4);
      for (let r = 0; r < markers.rows; r++) {
        const output = dst.ucharPtr(r);
        const original = colorImage.ucharPtr(r);
        for (let c = 0; c < markers.cols; c++) {
          const offset = c * 4;
          if (markers.intPtr(r, c)[0] === -1) {
            output[offset] = 255; output[offset + 1] = 255; output[offset + 2] = 255;
          } else {
            output[offset] = original[c * 3]; output[offset + 1] = original[c * 3 + 1]; output[offset + 2] = original[c * 3 + 2];
          }
          output[offset + 3] = 255;
        }
      }
    } else if (type === 'findContours') {
      const gray = mat();
      const contours = vector();
      const hierarchy = mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.Canny(gray, gray, 50, 150, 3, false);
      cv.findContours(gray, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);
      src.copyTo(dst);
      const thickness = Number(params.thickness ?? 1);
      const contourColor = scalar(0, 255, 0, 255);
      for (let i = 0; i < contours.size(); i++) {
        cv.drawContours(dst, contours, i, contourColor, thickness, cv.LINE_8, hierarchy, 0);
      }
    } else if (type === 'fftMag') {
      const gray = mat();
      const padded = mat();
      const real = mat();
      const imaginary = zeros(1, 1, cv.CV_32F);
      const inputPlanes = vector();
      const complex = mat();
      const outputPlanes = vector();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      const rows = cv.getOptimalDFTSize(gray.rows);
      const cols = cv.getOptimalDFTSize(gray.cols);
      cv.copyMakeBorder(gray, padded, 0, rows - gray.rows, 0, cols - gray.cols, cv.BORDER_CONSTANT, scalar(0, 0, 0, 0));
      padded.convertTo(real, cv.CV_32F);
      imaginary.create(real.rows, real.cols, cv.CV_32F);
      imaginary.setTo(scalar(0));
      inputPlanes.push_back(real);
      inputPlanes.push_back(imaginary);
      cv.merge(inputPlanes, complex);
      cv.dft(complex, complex);
      cv.split(complex, outputPlanes);
      const realOut = own(outputPlanes.get(0));
      const imagOut = own(outputPlanes.get(1));
      const magnitude = mat();
      cv.magnitude(realOut, imagOut, magnitude);
      const onesMat = ones(magnitude.rows, magnitude.cols, magnitude.type());
      cv.add(magnitude, onesMat, magnitude);
      cv.log(magnitude, magnitude);
      const cropWidth = magnitude.cols & -2;
      const cropHeight = magnitude.rows & -2;
      if (cropWidth < 2 || cropHeight < 2) throw new Error('Image is too small for FFT magnitude.');
      const cropped = own(magnitude.roi(rect(0, 0, cropWidth, cropHeight)));
      const halfWidth = cropped.cols / 2;
      const halfHeight = cropped.rows / 2;
      const q0 = own(cropped.roi(rect(0, 0, halfWidth, halfHeight)));
      const q1 = own(cropped.roi(rect(halfWidth, 0, halfWidth, halfHeight)));
      const q2 = own(cropped.roi(rect(0, halfHeight, halfWidth, halfHeight)));
      const q3 = own(cropped.roi(rect(halfWidth, halfHeight, halfWidth, halfHeight)));
      const temp = mat();
      q0.copyTo(temp); q3.copyTo(q0); temp.copyTo(q3);
      q1.copyTo(temp); q2.copyTo(q1); temp.copyTo(q2);
      cv.normalize(cropped, cropped, 0, 255, cv.NORM_MINMAX);
      const outputGray = mat();
      cropped.convertTo(outputGray, cv.CV_8UC1);
      cv.cvtColor(outputGray, dst, cv.COLOR_GRAY2RGBA);
    } else {
      src.copyTo(dst);
    }

    completed = true;
    return dst;
  } finally {
    // Every temporary resource, including partially-created outputs after exceptions,
    // is released exactly once. Only the final successful output escapes this function.
    const unique = [...new Set(allocations)].reverse();
    for (const resource of unique) {
      if (!completed || resource !== dst) {
        try { resource.delete(); } catch (_) { /* already released by OpenCV */ }
      }
    }
  }
}

