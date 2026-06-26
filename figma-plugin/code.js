figma.showUI(__html__, { width: 360, height: 480, themeColors: true });

const BLEND_MODES = {
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
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = base64.replace(/=+$/, "");
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = alphabet.indexOf(char);
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
  return decodeBase64((dataUrl || "").split(",")[1] || "");
}

function applyGeometry(node, layer, origin) {
  const bounds = layer.bounds || { x: 0, y: 0, width: 1, height: 1 };
  node.x = Math.round(bounds.x - origin.x);
  node.y = Math.round(bounds.y - origin.y);
  if ("resize" in node) {
    node.resize(Math.max(1, Math.round(bounds.width || 1)), Math.max(1, Math.round(bounds.height || 1)));
  }
  node.visible = layer.visible !== false;
  node.opacity = typeof layer.opacity === "number" ? Math.max(0, Math.min(1, layer.opacity)) : 1;
  try { node.blendMode = BLEND_MODES[layer.blendMode] || "NORMAL"; } catch (error) {}
}

function applyFallbackImage(node, layer, assetsById) {
  if (!layer.assetId || !assetsById.has(layer.assetId)) {
    node.fills = [{ type: "SOLID", color: { r: 0.92, g: 0.95, b: 0.97 } }];
    return false;
  }
  const asset = assetsById.get(layer.assetId);
  const image = figma.createImage(bytesFromDataUrl(asset.dataUrl));
  node.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
  return true;
}

async function createNode(layer, parent, assetsById, report, origin) {
  const layerOrigin = layer.kind === "group" ? layer.bounds || origin : origin;
  let node;

  if (layer.kind === "group") {
    node = figma.createFrame();
    node.name = layer.name || "Group";
    node.layoutMode = "NONE";
    node.clipsContent = false;
    node.fills = [];
    applyGeometry(node, layer, origin);
    parent.appendChild(node);
    for (const child of layer.children || []) await createNode(child, node, assetsById, report, layerOrigin);
    report.native += 1;
    return node;
  }

  if (layer.kind === "text" && layer.text && layer.conversion?.state !== "fallback") {
    node = figma.createText();
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    node.name = layer.name || "Text";
    node.fontName = { family: "Inter", style: "Regular" };
    node.characters = layer.text.value || "";
    if (layer.text.fontSize) node.fontSize = Math.max(1, Math.round(layer.text.fontSize));
    node.fills = [{ type: "SOLID", color: { r: 0.07, g: 0.09, b: 0.12 } }];
    applyGeometry(node, layer, origin);
    parent.appendChild(node);
    report.native += 1;
    return node;
  }

  node = figma.createRectangle();
  node.name = layer.name || "Layer";
  applyGeometry(node, layer, origin);
  const usedAsset = applyFallbackImage(node, layer, assetsById);
  parent.appendChild(node);

  if (layer.conversion?.state === "fallback" || usedAsset) report.fallback += 1;
  else if (layer.conversion?.state === "partial") report.partial += 1;
  else if (layer.conversion?.state === "unsupported") report.unsupported += 1;
  else report.native += 1;
  return node;
}

async function importDocument(documentModel) {
  const root = figma.createFrame();
  root.name = `${documentModel.sourceName || "LayerBridge import"} - LayerBridge`;
  root.resize(Math.max(1, documentModel.width || 1440), Math.max(1, documentModel.height || 960));
  root.x = Math.round(figma.viewport.center.x - root.width / 2);
  root.y = Math.round(figma.viewport.center.y - root.height / 2);
  root.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  figma.currentPage.appendChild(root);

  const assetsById = new Map((documentModel.assets || []).map((asset) => [asset.id, asset]));
  const report = { native: 0, partial: 0, fallback: 0, unsupported: 0 };
  for (const layer of documentModel.layers || []) await createNode(layer, root, assetsById, report, { x: 0, y: 0 });

  figma.currentPage.selection = [root];
  figma.viewport.scrollAndZoomIntoView([root]);
  return report;
}

figma.ui.onmessage = async (message) => {
  if (message.type === "cancel") {
    figma.closePlugin();
    return;
  }
  if (message.type !== "import-document") return;
  try {
    const report = await importDocument(message.document);
    figma.ui.postMessage({ type: "import-complete", report });
    figma.notify(`LayerBridge import complete: ${report.native + report.partial + report.fallback} nodes`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown import error";
    figma.ui.postMessage({ type: "import-error", detail });
    figma.notify(`LayerBridge import failed: ${detail}`, { error: true });
  }
};
