/**
 * PSD Converter — Client-side conversion logic
 * 
 * ag-psd로 PSD 파싱 → SVG(Illustrator)와 Figma JSON 생성
 * 백엔드 없이 브라우저에서 모든 처리.
 * 
 * 의존성: agPsd (global, from CDN)
 */

(function (global) {
  'use strict';

  // ──────────────────────────────────────────────
  // 블렌드 모드 매핑
  // ag-psd는 소문자 + 공백 문자열을 사용 ('color dodge' 등)
  // ──────────────────────────────────────────────
  const BLEND_TO_CSS = {
    'normal': 'normal', 'multiply': 'multiply', 'screen': 'screen',
    'overlay': 'overlay', 'darken': 'darken', 'lighten': 'lighten',
    'color dodge': 'color-dodge', 'color burn': 'color-burn',
    'hard light': 'hard-light', 'soft light': 'soft-light',
    'difference': 'difference', 'exclusion': 'exclusion',
    'hue': 'hue', 'saturation': 'saturation',
    'color': 'color', 'luminosity': 'luminosity',
    'linear dodge': 'screen',       // 근사
    'linear burn': 'color-burn',    // 근사
    'vivid light': 'hard-light',    // 근사
    'pin light': 'hard-light',      // 근사
    'dissolve': 'normal',           // 근사
    'pass through': 'normal',
    'darker color': 'darken',       // 근사
    'lighter color': 'lighten',     // 근사
  };

  const BLEND_TO_FIGMA = {
    'normal': 'NORMAL', 'multiply': 'MULTIPLY', 'screen': 'SCREEN',
    'overlay': 'OVERLAY', 'darken': 'DARKEN', 'lighten': 'LIGHTEN',
    'color dodge': 'COLOR_DODGE', 'color burn': 'COLOR_BURN',
    'hard light': 'HARD_LIGHT', 'soft light': 'SOFT_LIGHT',
    'difference': 'DIFFERENCE', 'exclusion': 'EXCLUSION',
    'hue': 'HUE', 'saturation': 'SATURATION',
    'color': 'COLOR', 'luminosity': 'LUMINOSITY',
    'pass through': 'PASS_THROUGH',
  };

  const blendCss = (bm) => BLEND_TO_CSS[bm] || 'normal';
  const blendFigma = (bm) => BLEND_TO_FIGMA[bm] || 'NORMAL';

  // ──────────────────────────────────────────────
  // 색상 유틸
  // ──────────────────────────────────────────────
  function colorToHex(c) {
    if (!c) return '#000000';
    // ag-psd: { r, g, b } in 0~255
    const r = Math.round(c.r || 0);
    const g = Math.round(c.g || 0);
    const b = Math.round(c.b || 0);
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  function colorToFigma(c) {
    if (!c) return { r: 0, g: 0, b: 0 };
    return {
      r: clamp01((c.r || 0) / 255),
      g: clamp01((c.g || 0) / 255),
      b: clamp01((c.b || 0) / 255),
    };
  }

  function hexToFigma(hex) {
    const h = (hex || '#000000').replace('#', '');
    return {
      r: parseInt(h.slice(0, 2), 16) / 255,
      g: parseInt(h.slice(2, 4), 16) / 255,
      b: parseInt(h.slice(4, 6), 16) / 255,
    };
  }

  function clamp01(v) { return Math.max(0, Math.min(1, v || 0)); }

  // ──────────────────────────────────────────────
  // 캔버스 → base64 PNG
  // ──────────────────────────────────────────────
  function canvasToBase64(canvas, maxDim = 4096) {
    if (!canvas) return null;
    try {
      let w = canvas.width, h = canvas.height;
      if (w === 0 || h === 0) return null;

      // 크기 제한 (메모리 절약)
      if (Math.max(w, h) > maxDim) {
        const scale = maxDim / Math.max(w, h);
        const scaled = document.createElement('canvas');
        scaled.width = Math.floor(w * scale);
        scaled.height = Math.floor(h * scale);
        scaled.getContext('2d').drawImage(canvas, 0, 0, scaled.width, scaled.height);
        canvas = scaled;
      }

      const dataUrl = canvas.toDataURL('image/png');
      return dataUrl.split(',')[1];  // base64 부분만
    } catch (e) {
      console.warn('canvas → base64 실패:', e.message);
      return null;
    }
  }

  // ──────────────────────────────────────────────
  // 이펙트 추출 (ag-psd의 layer.effects)
  // ──────────────────────────────────────────────
  function extractEffects(effects) {
    const out = {};
    if (!effects) return out;

    // Drop Shadow
    const ds = effects.dropShadow;
    if (Array.isArray(ds) && ds.length > 0 && ds[0].enabled !== false) {
      const fx = ds[0];
      const angle = fx.angle || 135;
      const dist = (fx.distance && fx.distance.value) || fx.distance || 5;
      const angleRad = angle * Math.PI / 180;
      out.drop_shadow = {
        color: colorToHex(fx.color),
        opacity: clamp01(fx.opacity || 0.75),
        angle: angle,
        distance: dist,
        dx: Math.round(dist * Math.cos(angleRad) * 100) / 100,
        dy: Math.round(-dist * Math.sin(angleRad) * 100) / 100,
        blur: (fx.size && fx.size.value) || fx.size || 5,
        spread: (fx.choke && fx.choke.value) || fx.choke || 0,
      };
    }

    // Inner Shadow
    const is = effects.innerShadow;
    if (Array.isArray(is) && is.length > 0 && is[0].enabled !== false) {
      const fx = is[0];
      out.inner_shadow = {
        color: colorToHex(fx.color),
        opacity: clamp01(fx.opacity || 0.75),
        blur: (fx.size && fx.size.value) || fx.size || 5,
        distance: (fx.distance && fx.distance.value) || fx.distance || 5,
      };
    }

    // Outer Glow
    const og = effects.outerGlow;
    if (Array.isArray(og) && og.length > 0 && og[0].enabled !== false) {
      const fx = og[0];
      out.outer_glow = {
        color: colorToHex(fx.color),
        opacity: clamp01(fx.opacity || 0.75),
        blur: (fx.size && fx.size.value) || fx.size || 10,
        spread: (fx.choke && fx.choke.value) || fx.choke || 0,
      };
    }

    // Inner Glow
    const ig = effects.innerGlow;
    if (Array.isArray(ig) && ig.length > 0 && ig[0].enabled !== false) {
      const fx = ig[0];
      out.inner_glow = {
        color: colorToHex(fx.color),
        opacity: clamp01(fx.opacity || 0.75),
        blur: (fx.size && fx.size.value) || fx.size || 10,
      };
    }

    // Stroke
    const st = effects.stroke;
    if (Array.isArray(st) && st.length > 0 && st[0].enabled !== false) {
      const fx = st[0];
      out.stroke = {
        color: colorToHex(fx.color),
        size: (fx.size && fx.size.value) || fx.size || 3,
        position: fx.position || 'outside',
        opacity: clamp01(fx.opacity || 1),
      };
    }

    // Color Overlay
    const co = effects.solidFill;
    if (Array.isArray(co) && co.length > 0 && co[0].enabled !== false) {
      const fx = co[0];
      out.color_overlay = {
        color: colorToHex(fx.color),
        opacity: clamp01(fx.opacity || 1),
        blend_mode: blendCss(fx.blendMode),
      };
    }

    return out;
  }

  // ──────────────────────────────────────────────
  // 텍스트 레이어 추출 (ag-psd의 layer.text)
  // ──────────────────────────────────────────────
  function extractText(textObj) {
    if (!textObj) return null;
    const result = {
      content: (textObj.text || '').replace(/\r/g, '\n'),
      font_family: 'Arial',
      font_size: 12,
      color: '#000000',
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      alignment: 'left',
      letter_spacing: 0,
      line_height: null,
      transform: null,
    };

    try {
      // ag-psd text.style 또는 첫번째 styleRun에서 스타일 추출
      let style = textObj.style;
      if (!style && textObj.styleRuns && textObj.styleRuns.length > 0) {
        style = textObj.styleRuns[0].style;
      }

      if (style) {
        if (style.font && style.font.name) {
          result.font_family = style.font.name;
        }
        if (typeof style.fontSize === 'number') {
          result.font_size = style.fontSize;
        }
        if (style.fillColor) {
          result.color = colorToHex(style.fillColor);
        }
        result.bold = !!style.fauxBold;
        result.italic = !!style.fauxItalic;
        result.underline = !!style.underline;
        result.strike = !!style.strikethrough;
        if (typeof style.tracking === 'number') {
          result.letter_spacing = (style.tracking / 1000) * result.font_size;
        }
        if (style.leading && typeof style.leading.value === 'number') {
          result.line_height = style.leading.value;
        } else if (typeof style.leading === 'number') {
          result.line_height = style.leading;
        }
      }

      // 정렬
      const para = textObj.paragraphStyle ||
                   (textObj.paragraphStyleRuns && textObj.paragraphStyleRuns[0] &&
                    textObj.paragraphStyleRuns[0].style);
      if (para && typeof para.justification === 'string') {
        result.alignment = para.justification.toLowerCase();
      }

      // 변형 행렬
      if (textObj.transform) {
        const t = textObj.transform;
        if (Array.isArray(t) && t.length >= 6) {
          // [xx, xy, yx, yy, tx, ty]
          result.transform = {
            xx: t[0], xy: t[1], yx: t[2], yy: t[3], tx: t[4], ty: t[5]
          };
        } else if (typeof t === 'object') {
          result.transform = {
            xx: t.xx || 1, xy: t.xy || 0, yx: t.yx || 0,
            yy: t.yy || 1, tx: t.tx || 0, ty: t.ty || 0
          };
        }
      }
    } catch (e) {
      console.warn('text 추출 실패:', e.message);
    }

    return result;
  }

  // ──────────────────────────────────────────────
  // 벡터 패스 추출 (ag-psd의 layer.vectorMask)
  // ──────────────────────────────────────────────
  function extractVectorPaths(vectorMask, docW, docH) {
    if (!vectorMask || !vectorMask.paths) return [];

    const paths = [];
    for (const path of vectorMask.paths) {
      if (!path.knots || path.knots.length === 0) continue;
      const closed = path.open !== true;
      const d = knotsToSvg(path.knots, docW, docH, closed);
      if (d) paths.push(d);
    }
    return paths;
  }

  function knotsToSvg(knots, docW, docH, closed) {
    if (knots.length === 0) return null;
    const parts = [];

    // ag-psd points: [preY, preX, anchorY, anchorX, postY, postX]
    // 좌표가 픽셀인지 normalized(0~1)인지 케이스마다 다를 수 있어 자동 감지
    const allPoints = knots.flatMap(k => k.points || []);
    const maxVal = Math.max(...allPoints.map(Math.abs).filter(v => isFinite(v)));
    const isNormalized = maxVal <= 1.0;

    const sx = isNormalized ? docW : 1;
    const sy = isNormalized ? docH : 1;

    for (let i = 0; i < knots.length; i++) {
      const k = knots[i];
      const pts = k.points || [];
      if (pts.length < 4) continue;

      // anchor 좌표
      const ax = pts[3] * sx;
      const ay = pts[2] * sy;

      if (i === 0) {
        parts.push(`M ${ax.toFixed(2)},${ay.toFixed(2)}`);
      } else {
        // 이전 knot의 post 컨트롤
        const prev = knots[i - 1].points || [];
        const c1x = (prev[5] !== undefined ? prev[5] : prev[3]) * sx;
        const c1y = (prev[4] !== undefined ? prev[4] : prev[2]) * sy;
        // 현재 knot의 pre 컨트롤
        const c2x = (pts[1] !== undefined ? pts[1] : pts[3]) * sx;
        const c2y = (pts[0] !== undefined ? pts[0] : pts[2]) * sy;

        parts.push(`C ${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${ax.toFixed(2)},${ay.toFixed(2)}`);
      }
    }

    if (closed) parts.push('Z');
    return parts.length > 1 ? parts.join(' ') : null;
  }

  // ──────────────────────────────────────────────
  // 도형 채우기 색상 추출
  // ──────────────────────────────────────────────
  function extractFillColor(layer) {
    try {
      if (layer.vectorFill && layer.vectorFill.color) {
        return colorToHex(layer.vectorFill.color);
      }
      if (layer.solidColor) {
        return colorToHex(layer.solidColor);
      }
    } catch (e) {}
    return '#808080';
  }

  // ──────────────────────────────────────────────
  // 레이어 파싱 (재귀)
  // ──────────────────────────────────────────────
  let layerIdCounter = 0;

  function parseLayer(layer, docW, docH) {
    layerIdCounter++;

    // 좌표 (좌측상단)
    const x = layer.left || 0;
    const y = layer.top || 0;
    const w = (layer.right || 0) - x;
    const h = (layer.bottom || 0) - y;

    const base = {
      id: `L${layerIdCounter}`,
      name: layer.name || 'Layer',
      visible: !layer.hidden,
      // ag-psd opacity: 0~1, 없으면 1
      opacity: typeof layer.opacity === 'number' ? clamp01(layer.opacity) : 1,
      blend_mode_css: blendCss(layer.blendMode),
      blend_mode_figma: blendFigma(layer.blendMode),
      x: x, y: y, w: Math.max(w, 1), h: Math.max(h, 1),
      effects: extractEffects(layer.effects),
    };

    // 타입 분기 (ag-psd 문서 권장 순서)
    if (Array.isArray(layer.children)) {
      base.type = 'group';
      base.children = layer.children.map(c => parseLayer(c, docW, docH));
    } else if (layer.text) {
      base.type = 'text';
      base.text = extractText(layer.text);
      base.image = canvasToBase64(layer.canvas);
    } else if (layer.adjustment) {
      base.type = 'adjustment';
      const adj = layer.adjustment;
      base.adjustment = {
        kind: adj.type || 'unknown',
        filter_type: mapAdjustmentType(adj.type),
        ...extractAdjustmentParams(adj),
      };
    } else if (layer.placedLayer) {
      base.type = 'smart_object';
      base.image = canvasToBase64(layer.canvas);
    } else if (layer.vectorMask) {
      base.type = 'shape';
      base.paths = extractVectorPaths(layer.vectorMask, docW, docH);
      base.fill_color = extractFillColor(layer);
      base.image = canvasToBase64(layer.canvas);  // 폴백
    } else if (layer.canvas) {
      base.type = 'pixel';
      base.image = canvasToBase64(layer.canvas);
    } else {
      base.type = 'pixel';
      base.image = null;
    }

    return base;
  }

  function mapAdjustmentType(type) {
    if (!type) return 'unknown';
    const t = type.toLowerCase();
    if (t.includes('brightness')) return 'brightness_contrast';
    if (t.includes('hue')) return 'hue_saturation';
    if (t.includes('curves')) return 'curves';
    if (t.includes('levels')) return 'levels';
    if (t.includes('invert')) return 'invert';
    if (t.includes('threshold')) return 'threshold';
    if (t.includes('color balance')) return 'color_balance';
    if (t.includes('exposure')) return 'exposure';
    if (t.includes('vibrance')) return 'vibrance';
    return 'unknown';
  }

  function extractAdjustmentParams(adj) {
    const params = {};
    if (typeof adj.brightness === 'number') params.brightness = adj.brightness;
    if (typeof adj.contrast === 'number') params.contrast = adj.contrast;
    if (typeof adj.hue === 'number') params.hue = adj.hue;
    if (typeof adj.saturation === 'number') params.saturation = adj.saturation;
    if (typeof adj.lightness === 'number') params.lightness = adj.lightness;
    return params;
  }

  // ──────────────────────────────────────────────
  // 통계 집계
  // ──────────────────────────────────────────────
  function countTypes(layers) {
    const counts = {};
    function walk(list) {
      for (const l of list) {
        counts[l.type] = (counts[l.type] || 0) + 1;
        if (l.type === 'group' && l.children) walk(l.children);
      }
    }
    walk(layers);
    return counts;
  }

  function totalLayers(counts) {
    return Object.values(counts).reduce((a, b) => a + b, 0);
  }

  // ──────────────────────────────────────────────
  // 메인 파서
  // ──────────────────────────────────────────────
  function parsePSD(arrayBuffer) {
    if (typeof agPsd === 'undefined') {
      throw new Error('ag-psd 라이브러리가 로드되지 않았습니다.');
    }

    layerIdCounter = 0;
    const psd = agPsd.readPsd(arrayBuffer, {
      skipCompositeImageData: true,  // 합성 이미지는 불필요
      skipThumbnail: true,
    });

    const docW = psd.width;
    const docH = psd.height;
    const layers = (psd.children || []).map(c => parseLayer(c, docW, docH));
    // ag-psd는 자식을 위→아래 순서로 반환 (PSD 파일 순서). 그대로 사용.

    const types = countTypes(layers);
    return {
      document: {
        width: docW,
        height: docH,
        color_mode: psd.colorMode || 'RGB',
      },
      layers: layers,
      stats: {
        total_layers: totalLayers(types),
        types: types,
      },
    };
  }


  // ════════════════════════════════════════════════
  // SVG 생성기
  // ════════════════════════════════════════════════
  let filterCounter = 0;
  const nextFid = () => `fx${++filterCounter}`;
  const safeId = (name) => {
    let s = (name || 'layer').replace(/[^\w\-]/g, '_');
    if (/^\d/.test(s)) s = 'l_' + s;
    return s || 'layer';
  };

  // XML escape
  const xmlEsc = (s) => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  function buildDropShadowFilter(fx) {
    const fid = nextFid();
    return {
      id: fid,
      xml: `<filter id="${fid}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
        <feDropShadow dx="${fx.dx || 5}" dy="${fx.dy || 5}" stdDeviation="${(fx.blur || 5) / 2}" flood-color="${fx.color || '#000'}" flood-opacity="${fx.opacity || 0.75}"/>
      </filter>`
    };
  }

  function buildOuterGlowFilter(fx) {
    const fid = nextFid();
    return {
      id: fid,
      xml: `<filter id="${fid}" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="${(fx.blur || 10) / 2}" result="blur"/>
        <feFlood flood-color="${fx.color || '#fff'}" flood-opacity="${fx.opacity || 0.75}"/>
        <feComposite in2="blur" operator="in" result="glow"/>
        <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>`
    };
  }

  function buildInnerShadowFilter(fx) {
    const fid = nextFid();
    return {
      id: fid,
      xml: `<filter id="${fid}" x="-50%" y="-50%" width="200%" height="200%">
        <feFlood flood-color="${fx.color || '#000'}" flood-opacity="${fx.opacity || 0.75}"/>
        <feComposite in2="SourceAlpha" operator="out" result="shadow"/>
        <feGaussianBlur in="shadow" stdDeviation="${(fx.blur || 5) / 2}" result="blurred"/>
        <feComposite in2="SourceAlpha" operator="in"/>
      </filter>`
    };
  }

  function makeEffectFilter(effects, defsArr) {
    if (!effects || Object.keys(effects).length === 0) return null;
    let f = null;
    if (effects.drop_shadow) f = buildDropShadowFilter(effects.drop_shadow);
    else if (effects.outer_glow) f = buildOuterGlowFilter(effects.outer_glow);
    else if (effects.inner_shadow) f = buildInnerShadowFilter(effects.inner_shadow);
    if (f) {
      defsArr.push(f.xml);
      return f.id;
    }
    return null;
  }

  function commonAttrs(layer, filterId) {
    const attrs = [];
    if (!layer.visible) attrs.push('visibility="hidden"');
    if (layer.opacity < 1) attrs.push(`opacity="${layer.opacity.toFixed(4)}"`);

    const styles = [];
    if (layer.blend_mode_css && layer.blend_mode_css !== 'normal') {
      styles.push(`mix-blend-mode:${layer.blend_mode_css}`);
    }
    if (filterId) styles.push(`filter:url(#${filterId})`);
    if (styles.length) attrs.push(`style="${styles.join(';')}"`);

    return attrs.join(' ');
  }

  function renderLayerSvg(layer, defsArr, docW, docH) {
    const lid = safeId(layer.name);
    const filterId = makeEffectFilter(layer.effects, defsArr);
    const attrs = commonAttrs(layer, filterId);

    if (layer.type === 'group') {
      const children = (layer.children || [])
        .map(c => renderLayerSvg(c, defsArr, docW, docH))
        .join('\n');
      return `<g id="${xmlEsc(lid)}" inkscape:label="${xmlEsc(layer.name)}" inkscape:groupmode="layer" ${attrs}>\n${children}\n</g>`;
    }

    if (layer.type === 'text' && layer.text) {
      const t = layer.text;
      const lines = (t.content || '').split('\n');
      const fontSize = t.font_size || 12;
      const lineHeight = t.line_height || (fontSize * 1.2);
      const textAnchor = { left: 'start', center: 'middle', right: 'end', justify: 'start' }[t.alignment] || 'start';

      const transform = t.transform
        ? `transform="matrix(${t.transform.xx},${t.transform.xy},${t.transform.yx},${t.transform.yy},${t.transform.tx},${t.transform.ty})"`
        : '';

      const decoration = [
        t.underline ? 'underline' : null,
        t.strike ? 'line-through' : null,
      ].filter(Boolean).join(' ') || 'none';

      const tspans = lines.length === 1
        ? xmlEsc(lines[0])
        : lines.map((line, i) => `<tspan x="${layer.x}" dy="${i === 0 ? 0 : lineHeight}">${xmlEsc(line || ' ')}</tspan>`).join('');

      return `<g id="${xmlEsc(lid)}"><text x="${layer.x}" y="${layer.y + fontSize}" font-family="${xmlEsc(t.font_family)}" font-size="${fontSize}" fill="${t.color}" font-weight="${t.bold ? 'bold' : 'normal'}" font-style="${t.italic ? 'italic' : 'normal'}" text-decoration="${decoration}" text-anchor="${textAnchor}" ${transform} ${attrs}>${tspans}</text></g>`;
    }

    if (layer.type === 'shape') {
      if (layer.paths && layer.paths.length > 0) {
        const d = layer.paths.join(' ');
        const stroke = layer.effects && layer.effects.stroke;
        const strokeAttrs = stroke
          ? `stroke="${stroke.color}" stroke-width="${stroke.size}" stroke-opacity="${stroke.opacity}"`
          : '';
        return `<path id="${xmlEsc(lid)}" d="${d}" fill="${layer.fill_color || '#808080'}" ${strokeAttrs} ${attrs}/>`;
      }
      // 폴백 이미지
      if (layer.image) {
        return imageSvg(layer, lid, attrs);
      }
      // 최후 폴백
      return `<rect id="${xmlEsc(lid)}" x="${layer.x}" y="${layer.y}" width="${layer.w}" height="${layer.h}" fill="${layer.fill_color || '#cccccc'}" ${attrs}/>`;
    }

    if (layer.type === 'adjustment') {
      // SVG 필터로 근사. 일단 빈 사각형으로 표식만.
      return `<!-- adjustment layer: ${xmlEsc(layer.name)} -->`;
    }

    // pixel, smart_object, fill, unknown
    if (layer.image) {
      return imageSvg(layer, lid, attrs);
    }

    return `<!-- empty layer: ${xmlEsc(layer.name)} -->`;
  }

  function imageSvg(layer, lid, attrs) {
    return `<image id="${xmlEsc(lid)}" x="${layer.x}" y="${layer.y}" width="${layer.w}" height="${layer.h}" preserveAspectRatio="none" href="data:image/png;base64,${layer.image}" ${attrs}/>`;
  }

  function generateSVG(parsed) {
    filterCounter = 0;
    const { document: doc, layers } = parsed;
    const w = doc.width;
    const h = doc.height;
    const defs = [];

    const body = layers.map(l => renderLayerSvg(l, defs, w, h)).join('\n');

    return `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" version="1.1">
  <defs>
${defs.map(d => '    ' + d).join('\n')}
  </defs>
  <rect id="background" x="0" y="0" width="${w}" height="${h}" fill="white"/>
${body}
</svg>`;
  }


  // ════════════════════════════════════════════════
  // Figma JSON 생성기
  // ════════════════════════════════════════════════
  function makeFigmaEffects(effects) {
    const out = [];
    if (effects.drop_shadow) {
      const fx = effects.drop_shadow;
      out.push({
        type: 'DROP_SHADOW', visible: true, blendMode: 'NORMAL',
        radius: fx.blur || 5, spread: fx.spread || 0,
        offset: { x: fx.dx || 0, y: fx.dy || 0 },
        color: { ...hexToFigma(fx.color), a: fx.opacity || 0.75 },
      });
    }
    if (effects.inner_shadow) {
      const fx = effects.inner_shadow;
      out.push({
        type: 'INNER_SHADOW', visible: true, blendMode: 'NORMAL',
        radius: fx.blur || 5, spread: 0,
        offset: { x: 0, y: fx.distance || 5 },
        color: { ...hexToFigma(fx.color), a: fx.opacity || 0.75 },
      });
    }
    if (effects.outer_glow) {
      const fx = effects.outer_glow;
      out.push({
        type: 'DROP_SHADOW', visible: true, blendMode: 'NORMAL',
        radius: fx.blur || 10, spread: fx.spread || 0,
        offset: { x: 0, y: 0 },
        color: { ...hexToFigma(fx.color), a: fx.opacity || 0.75 },
      });
    }
    if (effects.inner_glow) {
      const fx = effects.inner_glow;
      out.push({
        type: 'INNER_SHADOW', visible: true, blendMode: 'NORMAL',
        radius: fx.blur || 10, spread: 0,
        offset: { x: 0, y: 0 },
        color: { ...hexToFigma(fx.color), a: fx.opacity || 0.75 },
      });
    }
    return out;
  }

  function uid() {
    return 'id_' + Math.random().toString(36).slice(2, 11);
  }

  function layerToFigma(layer) {
    const base = {
      id: uid(),
      name: layer.name || 'Layer',
      visible: layer.visible !== false,
      opacity: clamp01(layer.opacity),
      blendMode: layer.blend_mode_figma || 'NORMAL',
      effects: makeFigmaEffects(layer.effects || {}),
      x: layer.x || 0,
      y: layer.y || 0,
      width: Math.max(layer.w || 1, 1),
      height: Math.max(layer.h || 1, 1),
    };

    if (layer.type === 'group') {
      base.type = 'GROUP';
      base.children = (layer.children || []).map(layerToFigma);
      return base;
    }
    if (layer.type === 'text' && layer.text) {
      base.type = 'TEXT';
      const t = layer.text;
      base.characters = t.content || '';
      base.style = {
        fontFamily: t.font_family || 'Arial',
        fontSize: t.font_size || 12,
        fontWeight: t.bold ? 700 : 400,
        italic: !!t.italic,
        textAlignHorizontal: {
          left: 'LEFT', center: 'CENTER', right: 'RIGHT', justify: 'JUSTIFIED'
        }[t.alignment] || 'LEFT',
        letterSpacing: t.letter_spacing || 0,
        lineHeightPx: t.line_height || (t.font_size * 1.2),
        textDecoration: t.underline ? 'UNDERLINE' : (t.strike ? 'STRIKETHROUGH' : 'NONE'),
        fills: [{ type: 'SOLID', color: hexToFigma(t.color), opacity: 1 }],
      };
      if (layer.image) base._fallback_image = layer.image;
      return base;
    }
    if (layer.type === 'shape') {
      base.type = 'VECTOR';
      base.fills = [{ type: 'SOLID', color: hexToFigma(layer.fill_color || '#808080') }];
      base.strokes = [];
      base._svg_paths = layer.paths || [];
      if (layer.image) base._fallback_image = layer.image;
      return base;
    }
    if (layer.type === 'adjustment') {
      base.type = 'RECTANGLE';
      base.fills = [];
      base._is_adjustment = true;
      base._adjustment = layer.adjustment || {};
      return base;
    }
    // pixel / smart_object / unknown
    base.type = 'RECTANGLE';
    if (layer.image) {
      base.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageData: layer.image }];
    } else {
      base.fills = [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8 } }];
    }
    return base;
  }

  function generateFigmaJson(parsed) {
    const doc = parsed.document;
    return {
      version: '1.0',
      source: 'PSD Converter (client-side)',
      document: {
        width: doc.width,
        height: doc.height,
        color_mode: doc.color_mode,
      },
      artboard: {
        id: uid(),
        name: 'PSD Import',
        type: 'FRAME',
        x: 0, y: 0,
        width: doc.width,
        height: doc.height,
        fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }],
        strokes: [],
        effects: [],
        clipsContent: true,
        visible: true,
        opacity: 1,
        blendMode: 'NORMAL',
        children: (parsed.layers || []).map(layerToFigma),
      },
      stats: parsed.stats,
    };
  }


  // ════════════════════════════════════════════════
  // 공개 API
  // ════════════════════════════════════════════════
  global.PSDConverter = {
    convert: function (arrayBuffer) {
      const parsed = parsePSD(arrayBuffer);
      const svg = generateSVG(parsed);
      const figma = generateFigmaJson(parsed);
      return {
        document: parsed.document,
        stats: parsed.stats,
        svg: svg,
        figma_json: figma,
        // 디버깅용
        _parsed: parsed,
      };
    }
  };

})(typeof window !== 'undefined' ? window : globalThis);
