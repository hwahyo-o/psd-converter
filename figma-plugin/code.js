var UI_HTML = "<!doctype html>\n<html>\n<head>\n<meta charset=\"utf-8\" />\n<style>\n:root{font-family:Inter,Arial,sans-serif;color:#222;background:#fff}body{margin:0;padding:16px}h1{margin:0 0 6px;font-size:16px;line-height:22px}p{margin:0 0 12px;color:#666;font-size:12px;line-height:17px}.drop{display:grid;gap:8px;padding:18px;border:1px dashed #c8c8d0;border-radius:8px;background:#f7f7f9;text-align:center}input{width:100%;font-size:12px}.summary{display:grid;gap:8px;margin:14px 0}.row{display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid #e4e4e8;font-size:12px}.row strong{text-align:right}.actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}button{min-height:32px;border:1px solid #d2d2d8;border-radius:6px;background:#fff;color:#222;cursor:pointer;font:inherit;font-size:12px;font-weight:600}button.primary{border-color:#12877f;background:#12877f;color:#fff}button:disabled{cursor:not-allowed;opacity:.5}code{display:block;max-height:108px;overflow:auto;margin-top:12px;padding:8px;border-radius:6px;background:#f7f7f9;color:#666;font-size:11px;line-height:16px;white-space:pre-wrap}\n</style>\n</head>\n<body>\n<h1>PSD 변환기 가져오기</h1>\n<p>웹에서 받은 payload zip을 압축 해제한 뒤 <strong>document.json</strong>을 선택하세요.</p>\n<label class=\"drop\"><input id=\"file\" type=\"file\" accept=\"application/json,.json\" /><span id=\"fileLabel\">선택된 파일 없음</span></label>\n<div class=\"summary\"><div class=\"row\"><span>원본</span><strong id=\"source\">-</strong></div><div class=\"row\"><span>문서</span><strong id=\"size\">-</strong></div><div class=\"row\"><span>총 Layers</span><strong id=\"layers\">-</strong></div><div class=\"row\"><span>이미지 보존</span><strong id=\"image\">-</strong></div></div>\n<div class=\"actions\"><button id=\"cancel\">닫기</button><button class=\"primary\" id=\"import\" disabled>Figma에 가져오기</button></div>\n<code id=\"log\">payload를 기다리는 중입니다.</code>\n<script>\nvar fileInput=document.getElementById('file');var fileLabel=document.getElementById('fileLabel');var importButton=document.getElementById('import');var cancelButton=document.getElementById('cancel');var log=document.getElementById('log');var documentModel=null;function setSummary(model){document.getElementById('source').textContent=model.sourceName||'-';document.getElementById('size').textContent=(model.width||0)+' x '+(model.height||0);document.getElementById('layers').textContent=String(model.layerCount||0);document.getElementById('image').textContent=String(model.imageCount||model.fallbackCount||0)}fileInput.addEventListener('change',async function(event){var file=event.target.files[0];if(!file)return;try{var text=await file.text();documentModel=JSON.parse(text);if(!Array.isArray(documentModel.layers))throw new Error('LayerBridge document.json 형식이 아닙니다.');fileLabel.textContent=file.name;setSummary(documentModel);importButton.disabled=false;log.textContent='payload를 읽었습니다. 현재 Figma 페이지에 새 프레임을 생성합니다.'}catch(error){documentModel=null;importButton.disabled=true;log.textContent=error&&error.message?error.message:'payload를 읽을 수 없습니다.'}});importButton.addEventListener('click',function(){if(!documentModel)return;importButton.disabled=true;log.textContent='Figma 노드를 생성하는 중입니다...';parent.postMessage({pluginMessage:{type:'import-document',document:documentModel}},'*')});cancelButton.addEventListener('click',function(){parent.postMessage({pluginMessage:{type:'cancel'}},'*')});onmessage=function(event){var message=event.data.pluginMessage;if(!message)return;if(message.type==='import-complete'){log.textContent='완료되었습니다. 네이티브 '+message.report.native+', 부분 보존 '+message.report.partial+', 이미지 보존 '+message.report.image+', 미지원 '+message.report.unsupported;importButton.disabled=false}if(message.type==='import-error'){log.textContent=message.detail;importButton.disabled=false}};\n</script>\n</body>\n</html>\n";

figma.showUI(UI_HTML, { width: 380, height: 500 });

var BLEND_MODES = {
  normal: "NORMAL",
  multiply: "MULTIPLY",
  screen: "SCREEN",
  overlay: "OVERLAY",
  darken: "DARKEN",
  lighten: "LIGHTEN",
  "color dodge": "COLOR_DODGE",
  "color burn": "COLOR_BURN",
  "hard light": "HARD_LIGHT",
  "soft light": "SOFT_LIGHT",
  difference: "DIFFERENCE",
  exclusion: "EXCLUSION",
  hue: "HUE",
  saturation: "SATURATION",
  color: "COLOR",
  luminosity: "LUMINOSITY"
};

var loadedFonts = {};

async function loadUsableFont() {
  var candidates = [
    { family: "Inter", style: "Regular" },
    { family: "Roboto", style: "Regular" },
    { family: "Arial", style: "Regular" }
  ];
  for (var i = 0; i < candidates.length; i++) {
    var font = candidates[i];
    var key = font.family + "__" + font.style;
    if (loadedFonts[key]) return font;
    try {
      await figma.loadFontAsync(font);
      loadedFonts[key] = true;
      return font;
    } catch (e) {}
  }
  return null;
}

function normalizeBlend(value) {
  return String(value || "normal").toLowerCase().replace(/_/g, " ").replace(/-/g, " ").trim();
}

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

function solidFromHex(hex, opacity) {
  if (!hex || hex.charAt(0) !== "#" || hex.length < 7) return null;
  var r = parseInt(hex.slice(1, 3), 16) / 255;
  var g = parseInt(hex.slice(3, 5), 16) / 255;
  var b = parseInt(hex.slice(5, 7), 16) / 255;
  return { type: "SOLID", color: { r: r, g: g, b: b }, opacity: typeof opacity === "number" ? Math.max(0, Math.min(1, opacity)) : 1 };
}

function fillFromHex(hex, fallback, opacity) {
  var paint = solidFromHex(hex, opacity);
  return paint ? [paint] : fallback;
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
  try { node.blendMode = BLEND_MODES[normalizeBlend(layer.blendMode)] || "NORMAL"; } catch (e) {}
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

function applyFallbackFill(node, kind) {
  if (kind === "text") node.fills = [{ type: "SOLID", color: { r: 1, g: 0.96, b: 0.78 } }];
  else if (kind === "shape") node.fills = [{ type: "SOLID", color: { r: 0.88, g: 0.95, b: 0.94 } }];
  else if (kind === "smart" || kind === "raster") node.fills = [{ type: "SOLID", color: { r: 0.9, g: 0.94, b: 1 } }];
  else node.fills = [{ type: "SOLID", color: { r: 0.93, g: 0.95, b: 0.97 } }];
}

function applyShapeStyle(node, layer) {
  var shape = layer.shape || {};
  var fill = solidFromHex(shape.fill, shape.fillOpacity);
  if (fill) node.fills = [fill];
  var stroke = solidFromHex(shape.stroke, shape.strokeOpacity);
  if (stroke && shape.strokeWidth) {
    node.strokes = [stroke];
    node.strokeWeight = Math.max(1, Math.round(shape.strokeWidth));
  }
}

function applyLayerEffects(node, layer) {
  var source = layer.figmaEffects || [];
  var effects = [];
  var supportsSpread = node.type === "RECTANGLE" || node.type === "ELLIPSE" || node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE";
  for (var i = 0; i < source.length; i++) {
    var item = source[i];
    if (item.type === "shadow") {
      var color = solidFromHex(item.color || "#000000", item.opacity || 0.25);
      var effect = {
        type: "DROP_SHADOW",
        visible: true,
        color: color ? { r: color.color.r, g: color.color.g, b: color.color.b, a: color.opacity } : { r: 0, g: 0, b: 0, a: 0.25 },
        blendMode: "NORMAL",
        offset: { x: item.x || 0, y: item.y || 4 },
        radius: Math.max(0, item.blur || 8)
      };
      if (supportsSpread) effect.spread = Math.max(0, item.spread || 0);
      effects.push(effect);
    }
    var hasShapeStroke = !!(layer.shape && layer.shape.stroke);
    if (item.type === "stroke" && !hasShapeStroke) {
      var stroke = solidFromHex(item.color, item.opacity);
      try {
        if (stroke) {
          node.strokes = [stroke];
          node.strokeWeight = Math.max(1, item.width || 1);
        }
      } catch (e) {}
    }
  }
  try {
    if (effects.length) node.effects = effects;
  } catch (e) {}
}

function createFallbackRectangle(layer, parent, origin, labelSuffix) {
  var node = figma.createRectangle();
  node.name = (layer.name || "레이어") + (labelSuffix || "");
  applyGeometry(node, layer, origin);
  applyFallbackFill(node, layer.kind || "unknown");
  applyShapeStyle(node, layer);
  applyLayerEffects(node, layer);
  parent.appendChild(node);
  return node;
}

function stateBucket(layer) {
  var state = layer && layer.conversion ? layer.conversion.state : "native";
  if (state === "image") return "image";
  if (state === "review") return "review";
  if (state === "partial") return "partial";
  if (state === "unsupported") return "unsupported";
  return "native";
}

async function createTextNode(layer, parent, report, origin) {
  var font = await loadUsableFont();
  if (!font) {
    createFallbackRectangle(layer, parent, origin, " - 텍스트 대체");
    report.partial += 1;
    return null;
  }

  try {
    var node = figma.createText();
    node.name = layer.name || "텍스트";
    node.fontName = font;
    node.characters = layer.text.value || "";
    if (layer.text.fontSize) node.fontSize = Math.max(1, Math.round(layer.text.fontSize));
    node.fills = fillFromHex(layer.text.color, [{ type: "SOLID", color: { r: 0.07, g: 0.09, b: 0.12 } }]);
    applyGeometry(node, layer, origin);
    applyLayerEffects(node, layer);
    parent.appendChild(node);
    report.native += 1;
    return node;
  } catch (e) {
    createFallbackRectangle(layer, parent, origin, " - 텍스트 대체");
    report.partial += 1;
    return null;
  }
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
    applyLayerEffects(node, layer);
    parent.appendChild(node);
    var children = layer.children || [];
    for (var i = children.length - 1; i >= 0; i--) {
      try {
        await createNode(children[i], node, assetsById, report, layerOrigin);
      } catch (e) {
        report.partial += 1;
      }
    }
    report.native += 1;
    return node;
  }

  if (kind === "text" && layer.text) return await createTextNode(layer, parent, report, origin);

  node = figma.createRectangle();
  node.name = layer.name || "레이어";
  applyGeometry(node, layer, origin);
  var hasImage = applyImageFill(node, layer, assetsById);
  if (!hasImage) applyFallbackFill(node, kind);
  applyShapeStyle(node, layer);
  applyLayerEffects(node, layer);
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
  await loadUsableFont();
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
  for (var j = layers.length - 1; j >= 0; j--) {
    try {
      await createNode(layers[j], root, assetsById, report, { x: 0, y: 0 });
    } catch (e) {
      report.partial += 1;
    }
  }

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