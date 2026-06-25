/**
 * PSD Importer — Figma Plugin (code.js) v2
 * 안정성을 위해 figma.group() 사용 안 함, 모든 컨테이너를 Frame으로 통일
 */
figma.showUI(__html__, { width: 440, height: 580, title: "PSD Importer" });

const loadedFonts = new Set();
let DEFAULT_FONT = { family: "Inter", style: "Regular" };

async function ensureDefaultFont() {
  const candidates = [
    { family: "Inter", style: "Regular" },
    { family: "Roboto", style: "Regular" },
    { family: "Arial", style: "Regular" },
  ];
  for (const f of candidates) {
    try {
      await figma.loadFontAsync(f);
      DEFAULT_FONT = f;
      loadedFonts.add(`${f.family}__${f.style}`);
      return;
    } catch (e) {}
  }
  DEFAULT_FONT = { family: "Inter", style: "Regular" };
}

async function loadFontSafe(family, style) {
  const key = `${family}__${style}`;
  if (loadedFonts.has(key)) return { family, style };
  try {
    await figma.loadFontAsync({ family, style });
    loadedFonts.add(key);
    return { family, style };
  } catch (e) {
    try {
      const k2 = `${family}__Regular`;
      if (!loadedFonts.has(k2)) {
        await figma.loadFontAsync({ family, style: "Regular" });
        loadedFonts.add(k2);
      }
      return { family, style: "Regular" };
    } catch (e2) {
      return DEFAULT_FONT;
    }
  }
}

function figmaColor(c) {
  if (!c) return { r: 0, g: 0, b: 0 };
  return { r: clamp01(c.r), g: clamp01(c.g), b: clamp01(c.b) };
}
function clamp01(v) { return Math.max(0, Math.min(1, v || 0)); }

function applyBlendMode(node, blendModeStr) {
  const valid = new Set([
    "NORMAL", "MULTIPLY", "SCREEN", "OVERLAY", "DARKEN", "LIGHTEN",
    "COLOR_DODGE", "COLOR_BURN", "HARD_LIGHT", "SOFT_LIGHT",
    "DIFFERENCE", "EXCLUSION", "HUE", "SATURATION", "COLOR",
    "LUMINOSITY", "PASS_THROUGH",
  ]);
  try { if (valid.has(blendModeStr)) node.blendMode = blendModeStr; } catch (e) {}
}

function applyEffects(node, effects) {
  if (!effects || effects.length === 0) return;
  try {
    const valid = [];
    for (const fx of effects) {
      if (!["DROP_SHADOW", "INNER_SHADOW", "LAYER_BLUR", "BACKGROUND_BLUR"].includes(fx.type)) continue;
      valid.push({
        type: fx.type,
        visible: fx.visible !== false,
        blendMode: "NORMAL",
        color: {
          r: clamp01(fx.color && fx.color.r),
          g: clamp01(fx.color && fx.color.g),
          b: clamp01(fx.color && fx.color.b),
          a: clamp01((fx.color && fx.color.a) || 0.75),
        },
        radius: Math.max(0, fx.radius || 5),
        spread: Math.max(0, fx.spread || 0),
        offset: { x: (fx.offset && fx.offset.x) || 0, y: (fx.offset && fx.offset.y) || 0 },
        showShadowBehindNode: false,
      });
    }
    if (valid.length) node.effects = valid;
  } catch (e) { console.warn("Effect apply error:", e.message); }
}

async function applyImageFill(node, base64Data) {
  try {
    const bytes = figma.base64Decode
      ? figma.base64Decode(base64Data)
      : Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const image = figma.createImage(bytes);
    node.fills = [{ type: "IMAGE", scaleMode: "FILL", imageHash: image.hash }];
    return true;
  } catch (e) {
    console.warn("Image fill error:", e.message);
    node.fills = [{ type: "SOLID", color: { r: 0.8, g: 0.8, b: 0.8 } }];
    return false;
  }
}

function applyCommon(node, data, absX, absY) {
  try {
    node.name = data.name || "Layer";
    if (typeof data.opacity === "number") node.opacity = clamp01(data.opacity);
    applyBlendMode(node, data.blendMode);
    if (data.effects && data.effects.length) applyEffects(node, data.effects);
    node.x = absX;
    node.y = absY;
    node.visible = data.visible !== false;
  } catch (e) { console.warn("applyCommon error:", e.message); }
}

async function createNode(nodeData, parent, ctx) {
  const type = nodeData.type;
  let node = null;
  const absX = nodeData.x || 0;
  const absY = nodeData.y || 0;

  try {
    if (type === "GROUP" || type === "FRAME") {
      node = figma.createFrame();
      node.fills = (type === "FRAME")
        ? [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }]
        : [];
      node.clipsContent = false;
      const w = Math.max(nodeData.width || 1, 1);
      const h = Math.max(nodeData.height || 1, 1);
      node.resize(w, h);
      parent.appendChild(node);
      applyCommon(node, nodeData, absX, absY);

      for (const child of (nodeData.children || [])) {
        const childNode = await createNode(child, node, ctx);
        if (childNode) {
          try {
            childNode.x = (child.x || 0) - absX;
            childNode.y = (child.y || 0) - absY;
          } catch (e) {}
        }
        ctx.processed++;
        reportProgress(ctx);
      }
      return node;
    }

    if (type === "TEXT") {
      node = figma.createText();
      parent.appendChild(node);

      const style = nodeData.style || {};
      const family = style.fontFamily || DEFAULT_FONT.family;
      const wantStyle = style.italic ? "Italic" : (style.fontWeight >= 700 ? "Bold" : "Regular");
      const font = await loadFontSafe(family, wantStyle);
      node.fontName = font;

      const chars = nodeData.characters || "";
      if (chars.length > 0) node.characters = chars;

      try {
        if (style.fontSize) node.fontSize = Math.max(1, style.fontSize);
        const tf = (style.fills || [])[0];
        if (tf && tf.type === "SOLID") {
          node.fills = [{ type: "SOLID", color: figmaColor(tf.color) }];
        }
        if (style.letterSpacing) {
          node.letterSpacing = { value: style.letterSpacing, unit: "PIXELS" };
        }
        if (style.lineHeightPx) {
          node.lineHeight = { value: style.lineHeightPx, unit: "PIXELS" };
        }
        const alignMap = { LEFT: "LEFT", CENTER: "CENTER", RIGHT: "RIGHT", JUSTIFIED: "JUSTIFIED" };
        if (alignMap[style.textAlignHorizontal]) {
          node.textAlignHorizontal = alignMap[style.textAlignHorizontal];
        }
        if (style.textDecoration === "UNDERLINE") node.textDecoration = "UNDERLINE";
        else if (style.textDecoration === "STRIKETHROUGH") node.textDecoration = "STRIKETHROUGH";
      } catch (e) { console.warn("Text style error:", e.message); }

      applyCommon(node, nodeData, absX, absY);
      return node;
    }

    if (type === "VECTOR") {
      node = figma.createRectangle();
      node.resize(Math.max(nodeData.width || 1, 1), Math.max(nodeData.height || 1, 1));
      parent.appendChild(node);
      if (nodeData._fallback_image) {
        await applyImageFill(node, nodeData._fallback_image);
      } else {
        const fc = (nodeData.fills || [])[0];
        if (fc && fc.type === "SOLID") {
          node.fills = [{ type: "SOLID", color: figmaColor(fc.color) }];
        } else {
          node.fills = [{ type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.5 } }];
        }
      }
      applyCommon(node, nodeData, absX, absY);
      return node;
    }

    if (type === "RECTANGLE") {
      node = figma.createRectangle();
      node.resize(Math.max(nodeData.width || 1, 1), Math.max(nodeData.height || 1, 1));
      parent.appendChild(node);
      if (nodeData._is_adjustment) {
        node.fills = [];
        node.name = "[조정] " + (nodeData.name || "Adjustment");
        node.visible = false;
      } else {
        const fill = (nodeData.fills || [])[0];
        if (fill && fill.type === "IMAGE" && fill.imageData) {
          await applyImageFill(node, fill.imageData);
        } else if (fill && fill.type === "SOLID") {
          node.fills = [{ type: "SOLID", color: figmaColor(fill.color) }];
        } else {
          node.fills = [{ type: "SOLID", color: { r: 0.8, g: 0.8, b: 0.8 } }];
        }
      }
      applyCommon(node, nodeData, absX, absY);
      return node;
    }

    node = figma.createRectangle();
    node.resize(Math.max(nodeData.width || 1, 1), Math.max(nodeData.height || 1, 1));
    parent.appendChild(node);
    node.fills = [{ type: "SOLID", color: { r: 0.8, g: 0.8, b: 0.8 } }];
    applyCommon(node, nodeData, absX, absY);
    return node;

  } catch (e) {
    console.error(`Node creation error [${type}] "${nodeData && nodeData.name}":`, e.message);
    return node;
  }
}

function reportProgress(ctx) {
  figma.ui.postMessage({ type: "progress", current: ctx.processed, total: ctx.total });
}

function countLayers(nodeData) {
  let n = 1;
  for (const c of (nodeData.children || [])) n += countLayers(c);
  return n;
}

async function importFromJSON(jsonData) {
  const { artboard } = jsonData;
  if (!artboard) throw new Error("artboard 데이터가 없습니다.");

  await ensureDefaultFont();

  const frame = figma.createFrame();
  frame.name = artboard.name || "PSD Import";
  frame.resize(
    Math.max(artboard.width || 800, 1),
    Math.max(artboard.height || 600, 1)
  );
  frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  frame.clipsContent = true;
  frame.x = 0;
  frame.y = 0;
  figma.currentPage.appendChild(frame);

  let total = 0;
  for (const c of (artboard.children || [])) total += countLayers(c);
  const ctx = { processed: 0, total: total || 1 };

  for (const childData of (artboard.children || [])) {
    await createNode(childData, frame, ctx);
    ctx.processed++;
    reportProgress(ctx);
  }

  figma.viewport.scrollAndZoomIntoView([frame]);
  figma.currentPage.selection = [frame];
  figma.ui.postMessage({ type: "done", layers: total, name: frame.name });
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === "import") {
    try {
      const json = JSON.parse(msg.json);
      await importFromJSON(json);
    } catch (e) {
      console.error("Import failed:", e);
      figma.ui.postMessage({ type: "error", message: (e && e.message) ? e.message : String(e) });
    }
  } else if (msg.type === "close") {
    figma.closePlugin();
  }
};
