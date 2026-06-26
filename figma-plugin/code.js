figma.showUI(__html__, { width: 380, height: 500, title: "PSD 변환기" });

var BLEND_MODES = {
  normal: "NORMAL",
  multiply: "MULTIPLY",
  screen: "SCREEN",
  overlay: "OVERLAY",
  darken: "DARKEN",
  lighten: "LIGHTEN",
  "color-dodge": "COLOR_DODGE",
  "color-burn": "COLOR_BURN",
  "hard-light": "HARD_LIGHT",
  "soft-light": "SOFT_LIGHT",
  difference: "DIFFERENCE",
  exclusion: "EXCLUSION",
  hue: "HUE",
  saturation: "SATURATION",
  color: "COLOR",
  luminosity: "LUMINOSITY"
};

function decodeBase64(base64) {
  if (typeof figma.base64Decode === "function") return figma.base64Decode(base64);
  var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var clean = String(base64 || "").replace(/=+$/, "");
  var bytes = [];
  var buffer = 0;
  var bits = 0;
  for (var i = 0; i < clean.length; i++) {
    var value = alphabet.indexOf(clean.charAt(i));
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

function bytesFromDataUrl(dataUrl) {
  return decodeBase64(String(dataUrl || "").split(",")[1] || "");
}

function fillFromHex(hex, fallback) {
  if (!hex || hex.charAt(0) !== "#" || hex.length < 7) return fallback;
  var r = parseInt(hex.slice(1, 3), 16) / 255;
  var g = parseInt(hex.slice(3, 5), 16) / 255;
  var b = parseInt(hex.slice(5, 7), 16) / 255;
  return [{ type: "SOLID", color: { r: r, g: g, b: b } }];
}

function applyGeometry(node, layer, origin) {
  var bounds = layer.bounds || { x: 0, y: 0, width: 1, height: 1 };
  node.x = Math.round((bounds.x || 0) - origin.x);
  node.y = Math.round((bounds.y || 0) - origin.y);
  if ("resize" in node) {
    node.resize(Math.max(1, Math.round(bounds.width || 1)), Math.max(1, Math.round(bounds.height || 1)));
  }
  node.visible = layer.visible !== false;
  node.opacity = typeof layer.opacity === "number" ? Math.max(0, Math.min(1, layer.opacity)) : 1;
  try { node.blendMode = BLEND_MODES[layer.blendMode] || "NORMAL"; } catch (e) {}
}

function applyImageFill(node, layer, assetsById) {
  if (!layer.assetId || !assetsById[layer.assetId]) return false;
  try {
    var asset = assetsById[layer.assetId];
    var image = figma.createImage(bytesFromDataUrl(asset.dataUrl));
    node.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
    return true;
  } catch (e) {
    return false;
  }
}

function stateBucket(layer) {
  var state = layer && layer.conversion ? layer.conversion.state : "native";
  if (state === "image") return "image";
  if (state === "review") return "review";
  if (state === "partial") return "partial";
  if (state === "unsupported") return "unsupported";
  return "native";
}

async function createNode(layer, parent, assetsById, report, origin) {
  var kind = layer.kind || "unknown";
  var layerOrigin = kind === "group" ? (layer.bounds || origin) : origin;
  var node = null;

  if (kind === "group") {
    node = figma.createFrame();
    node.name = layer.name || "그룹";
    node.layoutMode = "NONE";
    node.clipsContent = false;
    node.fills = [];
    applyGeometry(node, layer, origin);
    parent.appendChild(node);
    var children = layer.children || [];
    for (var i = 0; i < children.length; i++) await createNode(children[i], node, assetsById, report, layerOrigin);
    report.native += 1;
    return node;
  }

  if (kind === "text" && layer.text) {
    node = figma.createText();
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    node.name = layer.name || "텍스트";
    node.fontName = { family: "Inter", style: "Regular" };
    node.characters = layer.text.value || "";
    if (layer.text.fontSize) node.fontSize = Math.max(1, Math.round(layer.text.fontSize));
    node.fills = fillFromHex(layer.text.color, [{ type: "SOLID", color: { r: 0.07, g: 0.09, b: 0.12 } }]);
    applyGeometry(node, layer, origin);
    parent.appendChild(node);
    report.native += 1;
    return node;
  }

  node = figma.createRectangle();
  node.name = layer.name || "레이어";
  applyGeometry(node, layer, origin);
  var hasImage = applyImageFill(node, layer, assetsById);
  if (!hasImage) {
    if (kind === "shape") node.fills = [{ type: "SOLID", color: { r: 0.88, g: 0.95, b: 0.94 } }];
    else if (kind === "smart" || kind === "raster") node.fills = [{ type: "SOLID", color: { r: 0.9, g: 0.94, b: 1 } }];
    else node.fills = [{ type: "SOLID", color: { r: 0.93, g: 0.95, b: 0.97 } }];
  }
  parent.appendChild(node);

  var bucket = stateBucket(layer);
  if (hasImage || bucket === "image") report.image += 1;
  else if (bucket === "partial" || bucket === "review") report.partial += 1;
  else if (bucket === "unsupported") report.unsupported += 1;
  else report.native += 1;
  return node;
}

async function importDocument(documentModel) {
  if (!documentModel || !documentModel.layers) throw new Error("LayerBridge document.json 형식이 아닙니다.");
  var root = figma.createFrame();
  root.name = (documentModel.sourceName || "PSD 가져오기") + " - LayerBridge";
  root.resize(Math.max(1, documentModel.width || 1440), Math.max(1, documentModel.height || 960));
  root.x = Math.round(figma.viewport.center.x - root.width / 2);
  root.y = Math.round(figma.viewport.center.y - root.height / 2);
  root.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  figma.currentPage.appendChild(root);

  var assetsById = {};
  var assets = documentModel.assets || [];
  for (var i = 0; i < assets.length; i++) assetsById[assets[i].id] = assets[i];
  var report = { native: 0, partial: 0, image: 0, unsupported: 0 };
  var layers = documentModel.layers || [];
  for (var j = 0; j < layers.length; j++) await createNode(layers[j], root, assetsById, report, { x: 0, y: 0 });

  figma.currentPage.selection = [root];
  figma.viewport.scrollAndZoomIntoView([root]);
  return report;
}

figma.ui.onmessage = async function(message) {
  if (message.type === "cancel") {
    figma.closePlugin();
    return;
  }
  if (message.type !== "import-document") return;
  try {
    var report = await importDocument(message.document);
    figma.ui.postMessage({ type: "import-complete", report: report });
    figma.notify("LayerBridge 가져오기 완료");
  } catch (error) {
    var detail = error && error.message ? error.message : String(error);
    figma.ui.postMessage({ type: "import-error", detail: detail });
    figma.notify("LayerBridge 가져오기 실패: " + detail, { error: true });
  }
};
