import {
  BookOpen,
  ChefHat,
  Copy,
  Download,
  Home,
  Lock,
  MessageCircle,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Share2,
  Trophy,
  Unlock,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import recipesCsv from './data/recipes.csv?raw';
import receitasLogoUrl from '../assets/logo_receitas_horizontal.svg';

const STORAGE_KEY = 'copa-dos-sabores-progress-v1';
const TUTORIAL_STORAGE_KEY = 'copa-dos-sabores-tutorial-v1';

const ingredientCatalog = [
  { key: 'egg', label: 'Ovo', emoji: '🥚', score: 10 },
  { key: 'chicken', label: 'Filé de frango', emoji: '🍗', score: 12 },
  { key: 'beef', label: 'Carne', emoji: '🥩', score: 12 },
  { key: 'beans', label: 'Feijão', emoji: '🫘', score: 10 },
  { key: 'rice', label: 'Arroz', emoji: '🍚', score: 10 },
  { key: 'tomato', label: 'Tomate', emoji: '🍅', score: 10 },
  { key: 'onion', label: 'Cebola', emoji: '🧅', score: 10 },
  { key: 'cheese', label: 'Queijo', emoji: '🧀', score: 11 },
  { key: 'corn', label: 'Milho', emoji: '🌽', score: 10 },
  { key: 'pepper', label: 'Pimentão', emoji: '🫑', score: 11 },
  { key: 'potato', label: 'Batata', emoji: '🥔', score: 10 },
  { key: 'pasta', label: 'Massa', emoji: '🍝', score: 12 },
  { key: 'carrot', label: 'Cenoura', emoji: '🥕', score: 10 },
] as const;

type IngredientKey = (typeof ingredientCatalog)[number]['key'];
type Ingredient = (typeof ingredientCatalog)[number];
type Inventory = Record<IngredientKey, number>;

type Recipe = {
  id: string;
  country: string;
  flag: string;
  name: string;
  imageUrl: string;
  ingredients: Partial<Record<IngredientKey, number>>;
  steps: string[];
};

type FallingIngredient = {
  id: string;
  kind: 'ingredient';
  key: IngredientKey;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  vr: number;
  size: number;
  juggleCount: number;
  lastJuggledAt: number;
};

type FallingPenaltyCard = {
  id: string;
  kind: 'penalty-card';
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  vr: number;
  size: number;
};

type FallingBadBall = {
  id: string;
  kind: 'bad-ball';
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  vr: number;
  size: number;
  puncturedAt: number | null;
};

type FallingItem = FallingIngredient | FallingPenaltyCard | FallingBadBall;

type ItemTarget = {
  kind: 'item';
  item: FallingItem;
  distance: number;
  radius: number;
};

type IngredientTarget = ItemTarget & {
  item: FallingIngredient;
};

type PenaltyCardTarget = ItemTarget & {
  item: FallingPenaltyCard;
};

type BadBallTarget = ItemTarget & {
  item: FallingBadBall;
};

type FragmentTarget = {
  kind: 'fragment';
  effect: SliceEffect;
  distance: number;
  radius: number;
};

type SliceEffect = {
  id: string;
  key: IngredientKey;
  clipStart: number;
  clipEnd: number;
  depth: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  vr: number;
};

type SliceLock = {
  fragmentIds: string[];
  cursorX: number;
  cursorY: number;
  fallbackX: number;
  fallbackY: number;
  fallbackRadius: number;
};

type TrailPoint = {
  x: number;
  y: number;
  t: number;
};

type ScorePopup = {
  id: string;
  amount: number;
  isCombo: boolean;
  x: number;
  y: number;
  t: number;
};

type ComboBanner = {
  id: string;
  multiplier: number;
};

type PuncturedBall = {
  id: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  t: number;
};

type ActiveSliceCombo = {
  popupId: string;
  ingredientMultipliers: Map<string, number>;
  awardedPoints: number;
  lastMovementAt: number;
};

type Progress = {
  score: number;
  cuts: number;
  inventory: Inventory;
};

type EmbeddedScreen = 'playing' | 'pause' | 'menu' | 'receitas';
type CountdownValue = 3 | 2 | 1 | 'ja';

type ShareCardOptions = {
  score: number;
  recipes: Recipe[];
  shareUrl: string;
};

const INGREDIENTS: readonly Ingredient[] = ingredientCatalog;
const MIN_SLICE_MOVEMENT = 3;
const SLICE_REARM_DISTANCE = 20;
const INITIAL_LIVES = 3;
const TRAIL_LIFETIME_MS = 170;
const SCORE_POPUP_LIFETIME_MS = 520;
const COMBO_BANNER_LIFETIME_MS = 820;
const MOVEMENT_COMBO_RESET_MS = 260;
const POINTS_PER_SLICE_TARGET = 5;
const DIFFICULTY_RAMP_MS = 90000;
const JUGGLE_ZONE_HEIGHT_RATIO = 0.2;
const JUGGLE_REHIT_COOLDOWN_MS = 420;
const JUGGLE_GLOW_MAX_LEVEL = 3;
const SPIN_GESTURE_THRESHOLD_RADIANS = Math.PI * 1.5;
const LIFE_CARD_SPAWN_CHANCE = 0.1;
const BAD_BALL_SPAWN_CHANCE = 0.2;
const SPECIAL_ONLY_LAUNCH_CHANCE = 0.3;
const PUNCTURED_BALL_LIFETIME_MS = 900;
const COUNTDOWN_STEP_MS = 520;
const FINAL_RED_CARD_DELAY_MS = 1350;
const SCROLL_HINT_IDLE_MS = 10000;
const EMBED_PARENT_ORIGIN = import.meta.env.VITE_COPA_PARENT_ORIGIN || '*';
const GAME_TITLE = 'Copa dos Sabores';
const SHARE_IMAGE_FILENAME = 'copa-dos-sabores-resultado.png';

const INGREDIENT_BY_KEY = Object.fromEntries(
  INGREDIENTS.map((ingredient) => [ingredient.key, ingredient]),
) as Record<IngredientKey, Ingredient>;

function getJuggleMultiplier(juggleCount: number) {
  return 2 ** juggleCount;
}

function getComboPointsFromMultipliers(multipliers: Iterable<number>) {
  const multiplierList = [...multipliers];

  if (multiplierList.length === 0) {
    return 0;
  }

  if (multiplierList.length === 1) {
    return multiplierList[0];
  }

  return multiplierList.reduce(
    (sum, multiplier) => sum + POINTS_PER_SLICE_TARGET * multiplier,
    0,
  );
}

function getPenaltyCardStateClass(index: number, lives: number) {
  const receivedCards = INITIAL_LIVES - lives;

  if (lives <= 0 && index === INITIAL_LIVES - 1) {
    return 'is-red';
  }

  return index < receivedCards ? 'is-yellow' : 'is-empty';
}

type CsvRecord = Record<string, string>;

function normalizeCsvValue(value: string) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function slugifyCsvValue(value: string) {
  return (
    normalizeCsvValue(value)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'receita'
  );
}

const COUNTRY_FLAGS_BY_NAME: Record<string, string> = {
  [normalizeCsvValue('Brasil')]: '🇧🇷',
  [normalizeCsvValue('Argentina')]: '🇦🇷',
  [normalizeCsvValue('México')]: '🇲🇽',
  [normalizeCsvValue('Japão')]: '🇯🇵',
  [normalizeCsvValue('França')]: '🇫🇷',
  [normalizeCsvValue('Itália')]: '🇮🇹',
  [normalizeCsvValue('Alemanha')]: '🇩🇪',
  [normalizeCsvValue('Marrocos')]: '🇲🇦',
};

const INGREDIENT_KEY_BY_CSV_VALUE = Object.fromEntries(
  INGREDIENTS.flatMap((ingredient) => [
    [normalizeCsvValue(ingredient.key), ingredient.key],
    [normalizeCsvValue(ingredient.label), ingredient.key],
  ]),
) as Record<string, IngredientKey>;

function parseCsvRows(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];

    if (char === '"') {
      if (quoted && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === ',' && !quoted) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && csv[index + 1] === '\n') {
        index += 1;
      }

      row.push(field);
      if (row.some((cell) => cell.trim())) {
        rows.push(row);
      }
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((cell) => cell.trim())) {
    rows.push(row);
  }

  return rows;
}

function parseCsvRecords(csv: string): CsvRecord[] {
  const rows = parseCsvRows(csv);
  const headers = rows[0]?.map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/, '') : header).trim(),
  );

  if (!headers) {
    return [];
  }

  return rows.slice(1).map((cells) =>
    Object.fromEntries(
      headers.map((header, index) => [header, (cells[index] ?? '').trim()]),
    ),
  );
}

function getCsvCell(row: CsvRecord, ...names: string[]) {
  for (const name of names) {
    const value = row[name]?.trim();

    if (value) {
      return value;
    }
  }

  return '';
}

function normalizeRecipeImageUrl(value: string) {
  const imageUrl = value.trim();

  if (!imageUrl) {
    return '';
  }

  return imageUrl.startsWith('./') ? imageUrl.slice(2) : imageUrl;
}

function parseRecipeIngredients(row: CsvRecord, recipeName: string) {
  const ingredients: Partial<Record<IngredientKey, number>> = {};

  for (let index = 1; index <= 5; index += 1) {
    const suffix = String(index).padStart(2, '0');
    const ingredientName = getCsvCell(row, `Ingrediente${suffix}`);
    const amountText = getCsvCell(
      row,
      `quantidadeIngrediente${suffix}`,
      `QuantidadeIngrediente${suffix}`,
    );

    if (!ingredientName && !amountText) {
      continue;
    }

    const ingredientKey = INGREDIENT_KEY_BY_CSV_VALUE[normalizeCsvValue(ingredientName)];
    const amount = Number(amountText.replace(',', '.'));

    if (!ingredientKey || !Number.isFinite(amount) || amount <= 0) {
      console.warn(`Receita ignorou ingrediente inválido: ${recipeName} / ${ingredientName}`);
      continue;
    }

    ingredients[ingredientKey] = Math.max(1, Math.floor(amount));
  }

  return ingredients;
}

function parseRecipeSteps(row: CsvRecord) {
  const singleColumnSteps = getCsvCell(row, 'Modo de preparo', 'ModoPreparo', 'Preparo');

  if (singleColumnSteps) {
    return singleColumnSteps
      .split('|')
      .map((step) => step.trim())
      .filter(Boolean);
  }

  return [1, 2, 3]
    .map((stepIndex) => getCsvCell(row, `ModoPreparo${String(stepIndex).padStart(2, '0')}`))
    .filter(Boolean);
}

function parseRecipesCsv(csv: string): Recipe[] {
  return parseCsvRecords(csv)
    .map((row) => {
      const name = getCsvCell(row, 'Nome da receita', 'Nome');
      const country = getCsvCell(row, 'Pais', 'País');

      if (!name || !country) {
        return null;
      }

      const countryKey = normalizeCsvValue(country);
      const ingredients = parseRecipeIngredients(row, name);

      if (Object.keys(ingredients).length === 0) {
        console.warn(`Receita sem ingredientes válidos: ${name}`);
        return null;
      }

      return {
        id: getCsvCell(row, 'ID', 'Id') || `${slugifyCsvValue(country)}-${slugifyCsvValue(name)}`,
        country,
        flag: COUNTRY_FLAGS_BY_NAME[countryKey] ?? '🏳️',
        name,
        imageUrl: normalizeRecipeImageUrl(getCsvCell(row, 'Imagem', 'Image')),
        ingredients,
        steps: parseRecipeSteps(row),
      };
    })
    .filter((recipe): recipe is Recipe => recipe !== null);
}

const RECIPES: Recipe[] = parseRecipesCsv(recipesCsv);

function createEmptyInventory(): Inventory {
  return INGREDIENTS.reduce((inventory, ingredient) => {
    inventory[ingredient.key] = 0;
    return inventory;
  }, {} as Inventory);
}

function createEmptyProgress(): Progress {
  return {
    score: 0,
    cuts: 0,
    inventory: createEmptyInventory(),
  };
}

function loadProgress(): Progress {
  const fallback = createEmptyProgress();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as Partial<Progress>;
    const inventory = createEmptyInventory();

    for (const ingredient of INGREDIENTS) {
      const value = parsed.inventory?.[ingredient.key];
      inventory[ingredient.key] = typeof value === 'number' && value > 0 ? value : 0;
    }

    return {
      score: typeof parsed.score === 'number' && parsed.score > 0 ? parsed.score : 0,
      cuts: typeof parsed.cuts === 'number' && parsed.cuts > 0 ? parsed.cuts : 0,
      inventory,
    };
  } catch {
    return fallback;
  }
}

function saveProgress(progress: Progress) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Progress is a nice-to-have; the game still works without storage.
  }
}

function loadTutorialSeen() {
  try {
    return window.localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'seen';
  } catch {
    return false;
  }
}

function saveTutorialSeen() {
  try {
    window.localStorage.setItem(TUTORIAL_STORAGE_KEY, 'seen');
  } catch {
    // The tutorial can still be shown again if storage is unavailable.
  }
}

function clearTutorialSeen() {
  try {
    window.localStorage.removeItem(TUTORIAL_STORAGE_KEY);
  } catch {
    // Storage is optional; resetting in memory still keeps the current session consistent.
  }
}

function notifyEmbeddingPage(screen: EmbeddedScreen) {
  if (window.parent === window) {
    return;
  }

  window.parent.postMessage(
    {
      type: 'copa-game:screen',
      screen,
    },
    EMBED_PARENT_ORIGIN,
  );
}

function normalizeShareUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value, window.location.href).href;
  } catch {
    return null;
  }
}

function getInitialShareUrl() {
  return normalizeShareUrl(document.referrer) ?? window.location.href;
}

function isAllowedParentOrigin(origin: string) {
  return EMBED_PARENT_ORIGIN === '*' || origin === EMBED_PARENT_ORIGIN;
}

function getRecentShareRecipes(recipes: Recipe[]) {
  return recipes.slice(-3).reverse();
}

function getShareText(score: number, recipes: Recipe[]) {
  const recipeNames = recipes.map((recipe) => recipe.name);

  if (recipeNames.length === 0) {
    return `Fiz ${score} pontos no jogo ${GAME_TITLE}.`;
  }

  return `Fiz ${score} pontos no jogo ${GAME_TITLE} e descobri essas receitas: ${recipeNames.join(', ')}.`;
}

function loadCanvasImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Imagem indisponível.'));
    image.src = src;
  });
}

function fillRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
  context.fill();
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 3,
) {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;

    if (context.measureText(testLine).width <= maxWidth || !currentLine) {
      currentLine = testLine;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;

    if (lines.length === maxLines) {
      break;
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  lines.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight);
  });

  return y + lines.length * lineHeight;
}

async function createScoreShareImage({ score, recipes, shareUrl }: ShareCardOptions) {
  const canvas = document.createElement('canvas');
  const width = 1080;
  const height = 1350;
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas indisponível.');
  }

  context.fillStyle = '#0f3228';
  context.fillRect(0, 0, width, height);

  context.fillStyle = '#ffc800';
  context.font = '900 44px Inter, Arial, sans-serif';
  context.textBaseline = 'top';

  try {
    const logo = await loadCanvasImage(receitasLogoUrl);
    const logoWidth = 275;
    const logoHeight = logoWidth * (logo.naturalHeight / logo.naturalWidth);
    context.drawImage(logo, 72, 74, logoWidth, logoHeight);
    context.fillText('+ Copa do Mundo', 370, 86);
  } catch {
    context.fillText('receitas + Copa do Mundo', 72, 86);
  }

  context.fillStyle = '#ffffff';
  context.font = '800 42px Inter, Arial, sans-serif';
  drawWrappedText(context, getShareText(score, recipes), 72, 190, width - 144, 56, 3);

  context.fillStyle = '#ffc800';
  fillRoundedRect(context, 132, 390, width - 264, 315, 26);
  context.fillStyle = '#a5147d';
  context.font = '900 150px Inter, Arial, sans-serif';
  context.textAlign = 'center';
  context.fillText(String(score), width / 2, 448);
  context.font = '900 44px Inter, Arial, sans-serif';
  context.fillText('PONTOS', width / 2, 610);

  context.textAlign = 'left';
  context.fillStyle = '#a5147d';
  fillRoundedRect(context, 72, 795, width - 144, 330, 24);
  context.fillStyle = '#ffffff';
  context.font = '900 40px Inter, Arial, sans-serif';
  context.fillText('Receitas descobertas', 112, 835);

  const recipeList = recipes.length > 0 ? recipes : [];
  if (recipeList.length === 0) {
    context.fillStyle = '#5a2864';
    fillRoundedRect(context, 112, 910, width - 224, 80, 18);
    context.fillStyle = '#ffffff';
    context.font = '800 34px Inter, Arial, sans-serif';
    context.fillText('Nenhuma receita nova nesta rodada', 146, 930);
  } else {
    recipeList.forEach((recipe, index) => {
      const itemY = 905 + index * 82;
      context.fillStyle = '#5a2864';
      fillRoundedRect(context, 112, itemY, width - 224, 64, 16);
      context.fillStyle = '#ffffff';
      context.font = '800 34px Inter, Arial, sans-serif';
      context.fillText(`${recipe.flag}  ${recipe.name}`, 142, itemY + 15);
    });
  }

  context.fillStyle = '#ffffff';
  context.font = '900 42px Inter, Arial, sans-serif';
  context.textAlign = 'center';
  context.fillText('Jogue também', width / 2, 1224);
  context.textAlign = 'left';

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Não foi possível gerar a imagem.'));
      }
    }, 'image/png');
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  document.body.removeChild(textArea);
}

function recipeEntries(recipe: Recipe) {
  return Object.entries(recipe.ingredients) as Array<[IngredientKey, number]>;
}

function isRecipeUnlocked(recipe: Recipe, inventory: Inventory) {
  return recipeEntries(recipe).every(([key, amount]) => inventory[key] >= amount);
}

function makeId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function pickIngredient() {
  return INGREDIENTS[Math.floor(Math.random() * INGREDIENTS.length)];
}

function pickLaunchAmount(difficulty: number) {
  const roll = Math.random();
  const twoThreshold = 0.9 - difficulty * 0.38;
  const threeThreshold = 0.985 - difficulty * 0.18;
  const fourThreshold = 0.998 - difficulty * 0.068;

  if (roll < twoThreshold) {
    return 1;
  }

  if (roll < threeThreshold) {
    return 2;
  }

  if (roll < fourThreshold) {
    return 3;
  }

  return 4;
}

function createFallingIngredient(
  arenaWidth: number,
  arenaHeight: number,
  preferredX?: number,
): FallingIngredient {
  const ingredient = pickIngredient();
  const isMobileArena = arenaWidth < 620;
  const margin = Math.min(96, Math.max(46, arenaWidth * 0.12));
  const baseSize = arenaWidth < 560 ? 58 : 72;
  const upwardVelocity = isMobileArena ? -860 - Math.random() * 220 : -760 - Math.random() * 180;
  const randomX = margin + Math.random() * Math.max(1, arenaWidth - margin * 2);
  const x = Math.max(margin, Math.min(arenaWidth - margin, preferredX ?? randomX));

  return {
    id: makeId('ingredient'),
    kind: 'ingredient',
    key: ingredient.key,
    x,
    y: arenaHeight + 80,
    vx: (Math.random() - 0.5) * 180,
    vy: upwardVelocity,
    rotation: Math.random() * 90 - 45,
    vr: (Math.random() - 0.5) * 300,
    size: baseSize + Math.random() * 18,
    juggleCount: 0,
    lastJuggledAt: 0,
  };
}

function createFallingPenaltyCard(
  arenaWidth: number,
  arenaHeight: number,
  preferredX?: number,
): FallingPenaltyCard {
  const isMobileArena = arenaWidth < 620;
  const margin = Math.min(96, Math.max(46, arenaWidth * 0.12));
  const baseSize = arenaWidth < 560 ? 58 : 72;
  const upwardVelocity = isMobileArena ? -850 - Math.random() * 190 : -740 - Math.random() * 170;
  const randomX = margin + Math.random() * Math.max(1, arenaWidth - margin * 2);
  const x = Math.max(margin, Math.min(arenaWidth - margin, preferredX ?? randomX));

  return {
    id: makeId('life-card'),
    kind: 'penalty-card',
    x,
    y: arenaHeight + 80,
    vx: (Math.random() - 0.5) * 150,
    vy: upwardVelocity,
    rotation: Math.random() * 50 - 25,
    vr: (Math.random() - 0.5) * 220,
    size: baseSize + Math.random() * 12,
  };
}

function createFallingBadBall(
  arenaWidth: number,
  arenaHeight: number,
  preferredX?: number,
): FallingBadBall {
  const isMobileArena = arenaWidth < 620;
  const margin = Math.min(96, Math.max(46, arenaWidth * 0.12));
  const baseSize = arenaWidth < 560 ? 56 : 70;
  const upwardVelocity = isMobileArena ? -830 - Math.random() * 210 : -730 - Math.random() * 175;
  const randomX = margin + Math.random() * Math.max(1, arenaWidth - margin * 2);
  const x = Math.max(margin, Math.min(arenaWidth - margin, preferredX ?? randomX));

  return {
    id: makeId('bad-ball'),
    kind: 'bad-ball',
    x,
    y: arenaHeight + 80,
    vx: (Math.random() - 0.5) * 170,
    vy: upwardVelocity,
    rotation: Math.random() * 80 - 40,
    vr: (Math.random() - 0.5) * 280,
    size: baseSize + Math.random() * 14,
    puncturedAt: null,
  };
}

function createIngredientLaunch(
  arenaWidth: number,
  arenaHeight: number,
  amount: number,
): FallingItem[] {
  if (amount <= 0) {
    return [];
  }

  const margin = Math.min(96, Math.max(46, arenaWidth * 0.12));
  const span = Math.max(1, arenaWidth - margin * 2);

  if (amount === 1) {
    return [createFallingIngredient(arenaWidth, arenaHeight)];
  }

  return Array.from({ length: amount }, (_, index) => {
    const laneX = margin + span * ((index + 1) / (amount + 1));
    const jitter = (Math.random() - 0.5) * (span / (amount + 1)) * 0.58;

    return createFallingIngredient(arenaWidth, arenaHeight, laneX + jitter);
  });
}

function containHorizontalMotion(
  x: number,
  vx: number,
  halfWidth: number,
  arenaWidth: number,
) {
  const minX = Math.max(halfWidth, 0);
  const maxX = Math.max(minX, arenaWidth - halfWidth);

  if (x < minX) {
    return { x: minX, vx: Math.abs(vx) };
  }

  if (x > maxX) {
    return { x: maxX, vx: -Math.abs(vx) };
  }

  return { x, vx };
}

function isPointInJuggleZone(point: TrailPoint, arenaHeight: number) {
  return point.y >= arenaHeight * (1 - JUGGLE_ZONE_HEIGHT_RATIO);
}

function getJuggleGlowClass(juggleCount: number) {
  if (juggleCount <= 0) {
    return '';
  }

  return `is-juggled juggle-level-${Math.min(JUGGLE_GLOW_MAX_LEVEL, juggleCount)}`;
}

function applyJuggleToItems(
  items: FallingItem[],
  point: TrailPoint,
  arenaWidth: number,
  arenaHeight: number,
) {
  let closestIndex = -1;
  let closestDistance = Number.POSITIVE_INFINITY;

	  items.forEach((item, index) => {
	    if (item.kind !== 'ingredient') {
	      return;
	    }

    if (item.vy <= 0) {
      return;
    }

	    const distance = Math.hypot(item.x - point.x, item.y - point.y);
    const canRehit = point.t - item.lastJuggledAt >= JUGGLE_REHIT_COOLDOWN_MS;

    if (canRehit && distance <= item.size * 0.72 && distance < closestDistance) {
      closestIndex = index;
      closestDistance = distance;
    }
  });

  if (closestIndex === -1) {
    return items;
  }

  const isMobileArena = arenaWidth < 620;
  const bounceVelocity = isMobileArena ? -920 - Math.random() * 130 : -820 - Math.random() * 110;
  const bouncedItem = items[closestIndex];
  if (bouncedItem.kind !== 'ingredient') {
    return items;
  }

  const nextJuggleCount = bouncedItem.juggleCount + 1;

  return items.map((item, index) => {
    if (index !== closestIndex || item.kind !== 'ingredient') {
      return item;
    }

    return {
      ...item,
      y: Math.min(item.y, point.y - item.size * 0.32, arenaHeight - item.size * 0.45),
      vx: item.vx * 0.42 + Math.max(-170, Math.min(170, (item.x - point.x) * 3.2)),
      vy: bounceVelocity,
      vr: item.vr + (Math.random() > 0.5 ? 360 : -360),
      juggleCount: nextJuggleCount,
      lastJuggledAt: point.t,
    };
  });
}

function getSignedAngleDelta(previousAngle: number, currentAngle: number) {
  let delta = currentAngle - previousAngle;

  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }

  while (delta < -Math.PI) {
    delta += Math.PI * 2;
  }

  return delta;
}

type SliceSource = {
  key: IngredientKey;
  clipStart: number;
  clipEnd: number;
  depth: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  vr: number;
};

function splitSliceSource(source: SliceSource): SliceEffect[] {
  const midpoint = (source.clipStart + source.clipEnd) / 2;
  const parentCenter = (source.clipStart + source.clipEnd) / 2;
  const angle = (source.rotation * Math.PI) / 180;
  const axisX = Math.cos(angle);
  const axisY = Math.sin(angle);
  const nextDepth = source.depth + 1;

  return [
    { clipStart: source.clipStart, clipEnd: midpoint, direction: -1 },
    { clipStart: midpoint, clipEnd: source.clipEnd, direction: 1 },
  ].map(({ clipStart, clipEnd, direction }) => {
    const childCenter = (clipStart + clipEnd) / 2;
    const centerOffset = (childCenter - parentCenter) * source.size;
    const impulse = 155 + Math.random() * 115;

    return {
      id: makeId(`slice-${nextDepth}`),
      key: source.key,
      clipStart,
      clipEnd,
      depth: nextDepth,
      x: source.x + axisX * centerOffset,
      y: source.y + axisY * centerOffset,
      vx: source.vx * 0.42 + axisX * direction * impulse,
      vy: Math.max(70, source.vy * 0.24) + axisY * direction * impulse * 0.22 + Math.random() * 60,
      size: source.size,
      rotation: source.rotation,
      vr: source.vr * 0.32 + direction * (360 + Math.random() * 260),
    };
  });
}

function getFragmentBoxPosition(effect: SliceEffect) {
  const visualCenter = (effect.clipStart + effect.clipEnd) / 2;
  const centerOffset = (visualCenter - 0.5) * effect.size;
  const angle = (effect.rotation * Math.PI) / 180;

  return {
    left: effect.x - Math.cos(angle) * centerOffset,
    top: effect.y - Math.sin(angle) * centerOffset,
  };
}

function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(px - x1, py - y1);
  }

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;

  return Math.hypot(px - closestX, py - closestY);
}

function getSliceDistance(
  x: number,
  y: number,
  point: TrailPoint,
  previousPoint: TrailPoint | null,
) {
  const directDistance = Math.hypot(x - point.x, y - point.y);
  const segmentDistance = previousPoint
    ? distanceToSegment(x, y, previousPoint.x, previousPoint.y, point.x, point.y)
    : directDistance;

  return Math.min(directDistance, segmentDistance);
}

function isSliceLockReleased(lock: SliceLock, point: TrailPoint, fragments: SliceEffect[]) {
  const cursorMovedAway =
    Math.hypot(point.x - lock.cursorX, point.y - lock.cursorY) >= SLICE_REARM_DISTANCE;

  if (!cursorMovedAway) {
    return false;
  }

  const lockedIds = new Set(lock.fragmentIds);
  const lockedFragments = fragments.filter((fragment) => lockedIds.has(fragment.id));

  if (lockedFragments.length === 0) {
    return (
      Math.hypot(point.x - lock.fallbackX, point.y - lock.fallbackY) >
      lock.fallbackRadius + SLICE_REARM_DISTANCE
    );
  }

  return lockedFragments.every(
    (fragment) =>
      Math.hypot(point.x - fragment.x, point.y - fragment.y) >
      fragment.size * 0.42 + SLICE_REARM_DISTANCE,
  );
}

export default function App() {
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [items, setItems] = useState<FallingItem[]>([]);
  const [sliceEffects, setSliceEffects] = useState<SliceEffect[]>([]);
  const [trail, setTrail] = useState<TrailPoint[]>([]);
  const [scorePopups, setScorePopups] = useState<ScorePopup[]>([]);
  const [puncturedBalls, setPuncturedBalls] = useState<PuncturedBall[]>([]);
  const [comboBanner, setComboBanner] = useState<ComboBanner | null>(null);
  const [arenaSize, setArenaSize] = useState({ width: 1, height: 1 });
  const [gameStarted, setGameStarted] = useState(false);
  const [tutorialSeen, setTutorialSeen] = useState(() => loadTutorialSeen());
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [countdownValue, setCountdownValue] = useState<CountdownValue | null>(null);
  const [finalRedCardVisible, setFinalRedCardVisible] = useState(false);
  const [lives, setLives] = useState(INITIAL_LIVES);
  const [gameOver, setGameOver] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [confirmMenuOpen, setConfirmMenuOpen] = useState(false);
  const [unlockToast, setUnlockToast] = useState<Recipe | null>(null);
  const [sessionUnlockedRecipes, setSessionUnlockedRecipes] = useState<Recipe[]>([]);
  const [recipeNoticePending, setRecipeNoticePending] = useState(false);
  const [scrollHintVisible, setScrollHintVisible] = useState(false);
  const [shareUrl, setShareUrl] = useState(() => getInitialShareUrl());

  const arenaRef = useRef<HTMLElement | null>(null);
  const itemsRef = useRef<FallingItem[]>([]);
  const sliceEffectsRef = useRef<SliceEffect[]>([]);
  const sliceLockRef = useRef<SliceLock | null>(null);
  const pointerActiveRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const jugglePointRef = useRef<TrailPoint | null>(null);
  const spinAnglesRef = useRef<Map<string, number>>(new Map());
  const lastPointRef = useRef<TrailPoint | null>(null);
  const activeComboRef = useRef<ActiveSliceCombo | null>(null);
  const knownUnlockedRef = useRef<Set<string> | null>(null);
  const roundStartedAtRef = useRef(0);
  const badBallNeedsFoodGapRef = useRef(false);
  const livesRef = useRef(INITIAL_LIVES);

  if (knownUnlockedRef.current === null) {
    knownUnlockedRef.current = new Set(
      RECIPES.filter((recipe) => isRecipeUnlocked(recipe, progress.inventory)).map(
        (recipe) => recipe.id,
      ),
    );
  }

  const unlockedRecipes = useMemo(
    () => RECIPES.filter((recipe) => isRecipeUnlocked(recipe, progress.inventory)),
    [progress.inventory],
  );

  const gamePaused =
    !gameStarted ||
    countdownValue !== null ||
    recipesOpen ||
    selectedRecipe !== null ||
    confirmMenuOpen ||
    pauseOpen ||
    settingsOpen ||
    gameOver ||
    finalRedCardVisible ||
    lives <= 0;

  const embeddedScreen = useMemo<EmbeddedScreen>(() => {
    if (recipesOpen || selectedRecipe !== null) {
      return 'receitas';
    }

    if (!gameStarted) {
      return 'menu';
    }

    if (pauseOpen || settingsOpen || confirmMenuOpen || gameOver || finalRedCardVisible || lives <= 0) {
      return 'pause';
    }

    return 'playing';
  }, [
    confirmMenuOpen,
    countdownValue,
    finalRedCardVisible,
    gameOver,
    gameStarted,
    lives,
    pauseOpen,
    recipesOpen,
    selectedRecipe,
    settingsOpen,
  ]);

  const scrollHintEligible =
    !gameStarted ||
    pauseOpen ||
    settingsOpen ||
    tutorialOpen ||
    recipesOpen ||
    selectedRecipe !== null ||
    confirmMenuOpen ||
    gameOver;

  const registerMissedIngredients = useCallback((amount: number) => {
    setLives((currentLives) => Math.max(0, currentLives - amount));
  }, []);

  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  useEffect(() => {
    livesRef.current = lives;
  }, [lives]);

  useEffect(() => {
    notifyEmbeddingPage(embeddedScreen);
  }, [embeddedScreen]);

  useEffect(() => {
    if (!scrollHintEligible) {
      setScrollHintVisible(false);
      return;
    }

    let timeout = window.setTimeout(() => setScrollHintVisible(true), SCROLL_HINT_IDLE_MS);
    const resetScrollHintTimer = () => {
      setScrollHintVisible(false);
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => setScrollHintVisible(true), SCROLL_HINT_IDLE_MS);
    };

    window.addEventListener('pointerdown', resetScrollHintTimer);
    window.addEventListener('pointermove', resetScrollHintTimer);
    window.addEventListener('keydown', resetScrollHintTimer);
    window.addEventListener('wheel', resetScrollHintTimer, { passive: true });
    window.addEventListener('touchstart', resetScrollHintTimer, { passive: true });

    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('pointerdown', resetScrollHintTimer);
      window.removeEventListener('pointermove', resetScrollHintTimer);
      window.removeEventListener('keydown', resetScrollHintTimer);
      window.removeEventListener('wheel', resetScrollHintTimer);
      window.removeEventListener('touchstart', resetScrollHintTimer);
    };
  }, [scrollHintEligible]);

  useEffect(() => {
    if (countdownValue === null) {
      return;
    }

    const timeout = window.setTimeout(
      () => {
        setCountdownValue((currentValue) => {
          if (currentValue === 3) {
            return 2;
          }

          if (currentValue === 2) {
            return 1;
          }

          if (currentValue === 1) {
            return 'ja';
          }

          roundStartedAtRef.current = performance.now();
          return null;
        });
      },
      countdownValue === 'ja' ? 520 : COUNTDOWN_STEP_MS,
    );

    return () => window.clearTimeout(timeout);
  }, [countdownValue]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isAllowedParentOrigin(event.origin)) {
        return;
      }

      const data = event.data as { type?: unknown; url?: unknown };
      if (data?.type !== 'copa-game:share-url' || typeof data.url !== 'string') {
        return;
      }

      const nextShareUrl = normalizeShareUrl(data.url);
      if (nextShareUrl) {
        setShareUrl(nextShareUrl);
      }
    };

    window.addEventListener('message', handleMessage);

    if (window.parent !== window) {
      window.parent.postMessage({ type: 'copa-game:share-url-request' }, EMBED_PARENT_ORIGIN);
    }

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    const currentUnlocked = RECIPES.filter((recipe) =>
      isRecipeUnlocked(recipe, progress.inventory),
    );
    const knownUnlocked = knownUnlockedRef.current ?? new Set<string>();
    const freshUnlocks = currentUnlocked.filter((recipe) => !knownUnlocked.has(recipe.id));

    if (freshUnlocks.length > 0) {
      setUnlockToast(freshUnlocks[0]);

      if (gameStarted) {
        setRecipeNoticePending(true);
        setSessionUnlockedRecipes((currentRecipes) => {
          const currentIds = new Set(currentRecipes.map((recipe) => recipe.id));
          const nextRecipes = freshUnlocks.filter((recipe) => !currentIds.has(recipe.id));

          return [...currentRecipes, ...nextRecipes];
        });
      }
    }

    knownUnlockedRef.current = new Set(currentUnlocked.map((recipe) => recipe.id));
  }, [gameStarted, progress.inventory]);

  useEffect(() => {
    if (!unlockToast) {
      return;
    }

    const timeout = window.setTimeout(() => setUnlockToast(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [unlockToast]);

  useEffect(() => {
    const arena = arenaRef.current;
    if (!arena) {
      return;
    }

    const updateSize = () => {
      setArenaSize({
        width: Math.max(1, arena.clientWidth),
        height: Math.max(1, arena.clientHeight),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(arena);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!gameStarted || lives > 0 || gameOver) {
      return;
    }

    pointerActiveRef.current = false;
    activePointerIdRef.current = null;
    jugglePointRef.current = null;
    spinAnglesRef.current.clear();
    lastPointRef.current = null;
    itemsRef.current = [];
    sliceEffectsRef.current = [];
    sliceLockRef.current = null;
    activeComboRef.current = null;
    badBallNeedsFoodGapRef.current = false;
    setPauseOpen(false);
    setSettingsOpen(false);
    setItems([]);
    setSliceEffects([]);
    setTrail([]);
    setPuncturedBalls([]);
    setFinalRedCardVisible(true);

    const timeout = window.setTimeout(() => {
      setFinalRedCardVisible(false);
      setGameOver(true);
    }, FINAL_RED_CARD_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [gameOver, gameStarted, lives]);

  useEffect(() => {
    let frame = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.034, (now - lastTime) / 1000);
      lastTime = now;

      if (gamePaused) {
        frame = window.requestAnimationFrame(tick);
        return;
      }

      let movedItems = itemsRef.current.map((item) => {
        const gravity = arenaSize.width < 620 ? 760 : 720;
        const nextX = item.x + item.vx * dt;
        const contained = containHorizontalMotion(
          nextX,
          item.vx,
          item.size * 0.5,
          arenaSize.width,
        );

        return {
          ...item,
          x: contained.x,
          y: item.y + item.vy * dt,
          vx: contained.vx,
          vy: item.vy + gravity * dt,
          rotation: item.rotation + item.vr * dt,
        };
      });

      const jugglePoint = jugglePointRef.current;

      if (jugglePoint && isPointInJuggleZone(jugglePoint, arenaSize.height)) {
        movedItems = applyJuggleToItems(
          movedItems,
          { ...jugglePoint, t: now },
          arenaSize.width,
          arenaSize.height,
        );
      }

      const nextItems = movedItems.filter(
        (item) =>
          item.y < arenaSize.height + item.size * 1.8 &&
          (item.kind !== 'bad-ball' ||
            item.puncturedAt === null ||
            now - item.puncturedAt < PUNCTURED_BALL_LIFETIME_MS),
      );
      const visibleItemIds = new Set(nextItems.map((item) => item.id));
      const missedAmount = movedItems.filter(
        (item) => item.kind === 'ingredient' && !visibleItemIds.has(item.id),
      ).length;

      if (missedAmount > 0) {
        registerMissedIngredients(missedAmount);
      }

      itemsRef.current = nextItems;
      setItems(nextItems);

      setSliceEffects((currentEffects) => {
        const nextEffects = currentEffects
          .map((effect) => {
            const gravity = arenaSize.width < 620 ? 820 : 780;
            const fragmentWidth = Math.max(0.16, effect.clipEnd - effect.clipStart);
            const nextX = effect.x + effect.vx * dt;
            const contained = containHorizontalMotion(
              nextX,
              effect.vx,
              effect.size * fragmentWidth * 0.5,
              arenaSize.width,
            );

            return {
              ...effect,
              x: contained.x,
              y: effect.y + effect.vy * dt,
              vx: contained.vx,
              vy: effect.vy + gravity * dt,
              rotation: effect.rotation + effect.vr * dt,
            };
          })
          .filter(
            (effect) => effect.y < arenaSize.height + effect.size * 2,
          );

        sliceEffectsRef.current = nextEffects;
        return nextEffects;
      });

      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [arenaSize.height, arenaSize.width, gamePaused, registerMissedIngredients]);

  useEffect(() => {
    if (gamePaused) {
      return;
    }

    let timeout = 0;
    let cancelled = false;

    const schedule = () => {
      const elapsed = Math.max(0, performance.now() - roundStartedAtRef.current);
      const difficulty = Math.min(1, elapsed / DIFFICULTY_RAMP_MS);
      const minDelay = 1200 - difficulty * 580;
      const randomDelay = 650 - difficulty * 390;
      const delay = minDelay + Math.random() * randomDelay;

      timeout = window.setTimeout(() => {
        if (cancelled) {
          return;
        }

	        setItems((currentItems) => {
	          const openSlots = Math.max(0, 12 - currentItems.length);
          let remainingSlots = openSlots;
          const shouldLaunchLifeCard =
            remainingSlots > 0 &&
            livesRef.current < INITIAL_LIVES &&
            Math.random() < LIFE_CARD_SPAWN_CHANCE;
          const lifeCardLaunch = shouldLaunchLifeCard
            ? [createFallingPenaltyCard(arenaSize.width, arenaSize.height)]
            : [];
          remainingSlots -= lifeCardLaunch.length;

          const shouldLaunchBadBall =
            remainingSlots > 0 &&
            !badBallNeedsFoodGapRef.current &&
            Math.random() < BAD_BALL_SPAWN_CHANCE;
          const badBallLaunch =
            shouldLaunchBadBall
              ? [createFallingBadBall(arenaSize.width, arenaSize.height)]
              : [];
          remainingSlots -= badBallLaunch.length;

          const specialLaunchCount = lifeCardLaunch.length + badBallLaunch.length;
          const specialOnlyLaunch =
            specialLaunchCount === 1 && Math.random() < SPECIAL_ONLY_LAUNCH_CHANCE;
          const amount = specialOnlyLaunch
            ? 0
            : Math.min(remainingSlots, pickLaunchAmount(difficulty));
          const ingredientLaunch = createIngredientLaunch(arenaSize.width, arenaSize.height, amount);

          if (badBallLaunch.length > 0) {
            badBallNeedsFoodGapRef.current = true;
          } else if (ingredientLaunch.length > 0) {
            badBallNeedsFoodGapRef.current = false;
          }

	          const nextItems = [
	            ...currentItems,
	            ...ingredientLaunch,
            ...lifeCardLaunch,
            ...badBallLaunch,
	          ];

          itemsRef.current = nextItems;
          return nextItems;
        });

        schedule();
      }, delay);
    };

    schedule();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [arenaSize.height, arenaSize.width, gamePaused]);

  useEffect(() => {
    if (gamePaused) {
      return;
    }

    const interval = window.setInterval(() => {
      const now = performance.now();

      setTrail((currentTrail) =>
        currentTrail.filter((point) => now - point.t < TRAIL_LIFETIME_MS),
      );
      setScorePopups((currentPopups) =>
        currentPopups.filter((popup) => now - popup.t < SCORE_POPUP_LIFETIME_MS),
      );
    }, 40);

    return () => window.clearInterval(interval);
  }, [gamePaused]);

  useEffect(() => {
    if (!comboBanner) {
      return;
    }

    const timeout = window.setTimeout(() => setComboBanner(null), COMBO_BANNER_LIFETIME_MS);
    return () => window.clearTimeout(timeout);
  }, [comboBanner]);

  const registerSpinGesture = useCallback((point: TrailPoint, previousPoint: TrailPoint) => {
    const spinAngles = spinAnglesRef.current;
    let changed = false;
    const nextItems = itemsRef.current.map((item) => {
      if (item.kind !== 'ingredient') {
        return item;
      }

      const previousDistance = Math.hypot(previousPoint.x - item.x, previousPoint.y - item.y);
      const currentDistance = Math.hypot(point.x - item.x, point.y - item.y);
      const minSpinRadius = item.size * 0.78;
      const maxSpinRadius = item.size * 2.35;
      const isInsideSpinRing =
        previousDistance >= minSpinRadius &&
        currentDistance >= minSpinRadius &&
        previousDistance <= maxSpinRadius &&
        currentDistance <= maxSpinRadius;

      if (!isInsideSpinRing) {
        spinAngles.delete(item.id);
        return item;
      }

      const previousAngle = Math.atan2(previousPoint.y - item.y, previousPoint.x - item.x);
      const currentAngle = Math.atan2(point.y - item.y, point.x - item.x);
      const delta = getSignedAngleDelta(previousAngle, currentAngle);

      if (Math.abs(delta) > Math.PI * 0.82) {
        spinAngles.delete(item.id);
        return item;
      }

      const accumulatedAngle = (spinAngles.get(item.id) ?? 0) + delta;
      const completedSpins = Math.floor(
        Math.abs(accumulatedAngle) / SPIN_GESTURE_THRESHOLD_RADIANS,
      );
      const remainingAngle =
        completedSpins > 0
          ? accumulatedAngle -
            Math.sign(accumulatedAngle) * SPIN_GESTURE_THRESHOLD_RADIANS * completedSpins
          : accumulatedAngle;

      spinAngles.set(item.id, remainingAngle);

      if (completedSpins <= 0) {
        return item;
      }

      changed = true;

      return {
        ...item,
        juggleCount: item.juggleCount + completedSpins,
        lastJuggledAt: point.t,
      };
    });

    if (!changed) {
      return;
    }

    itemsRef.current = nextItems;
    setItems(nextItems);
  }, []);

  const sliceAt = useCallback((point: TrailPoint, previousPoint: TrailPoint) => {
    const itemTargets: ItemTarget[] = itemsRef.current
      .map((item) => ({
        kind: 'item' as const,
        item,
        distance: getSliceDistance(item.x, item.y, point, previousPoint),
        radius: item.size * 0.62,
      }))
      .filter((target) => target.distance <= target.radius);
    const fragmentTargets: FragmentTarget[] = sliceEffectsRef.current
      .map((effect) => ({
        kind: 'fragment' as const,
        effect,
        distance: getSliceDistance(effect.x, effect.y, point, previousPoint),
        radius: effect.size * 0.42,
      }))
      .filter((target) => target.distance <= target.radius);
    const targets: Array<ItemTarget | FragmentTarget> = [...itemTargets, ...fragmentTargets].sort(
      (a, b) => a.distance - b.distance,
    );

    if (targets.length === 0) {
      return;
    }

    const itemTargetsOnly = targets.filter((target): target is ItemTarget => target.kind === 'item');
    const ingredientTargets = itemTargetsOnly.filter(
      (target): target is IngredientTarget => target.item.kind === 'ingredient',
    );
    const penaltyCardTargets = itemTargetsOnly.filter(
      (target): target is PenaltyCardTarget => target.item.kind === 'penalty-card',
    );
    const badBallTargets = itemTargetsOnly.filter(
      (target): target is BadBallTarget =>
        target.item.kind === 'bad-ball' && target.item.puncturedAt === null,
    );
    const fragmentTargetsOnly = targets.filter(
      (target): target is FragmentTarget => target.kind === 'fragment',
    );
    const cutPoints = ingredientTargets.length + fragmentTargetsOnly.length;
    const cutIngredientEntries = ingredientTargets.map((target) => ({
        id: target.item.id,
        multiplier: getJuggleMultiplier(target.item.juggleCount),
      }));
    const fragmentCutPoints = fragmentTargetsOnly.length;
    const currentCombo =
      activeComboRef.current &&
      point.t - activeComboRef.current.lastMovementAt <= MOVEMENT_COMBO_RESET_MS
        ? activeComboRef.current
        : null;
    const comboIngredientMultipliers = new Map(currentCombo?.ingredientMultipliers ?? []);

    for (const entry of cutIngredientEntries) {
      comboIngredientMultipliers.set(entry.id, entry.multiplier);
    }

    const previousAwardedPoints = currentCombo?.awardedPoints ?? 0;
    const comboPoints = getComboPointsFromMultipliers(comboIngredientMultipliers.values());
    const comboEarnedPoints = comboPoints - previousAwardedPoints;
    const earnedPoints = comboEarnedPoints + fragmentCutPoints;
    const previousPopupId = currentCombo?.popupId ?? null;
    const nextPopupId = cutIngredientEntries.length > 0 ? makeId('score-popup') : null;
    const replacedPopupId = nextPopupId ? previousPopupId : null;

    if (comboIngredientMultipliers.size > 0) {
      activeComboRef.current = {
        popupId: nextPopupId ?? currentCombo?.popupId ?? makeId('score-popup'),
        ingredientMultipliers: comboIngredientMultipliers,
        awardedPoints: comboPoints,
        lastMovementAt: point.t,
      };
    }

	    setProgress((currentProgress) => {
	      const inventory = { ...currentProgress.inventory };

	      for (const target of ingredientTargets) {
	          inventory[target.item.key] += 1;
	      }

      return {
        score: currentProgress.score + earnedPoints,
        cuts: currentProgress.cuts + cutPoints,
        inventory,
      };
	    });

    if (penaltyCardTargets.length > 0) {
      setLives((currentLives) => Math.min(INITIAL_LIVES, currentLives + penaltyCardTargets.length));
    }

    if (badBallTargets.length > 0) {
      setLives((currentLives) => Math.max(0, currentLives - badBallTargets.length));
    }
	    setScorePopups((currentPopups) =>
	      {
        const freshPopups = currentPopups.filter(
          (popup) =>
            popup.id !== replacedPopupId && point.t - popup.t < SCORE_POPUP_LIFETIME_MS,
        );
        const nextPopups =
          nextPopupId && comboPoints > 0
            ? [
                ...freshPopups,
                {
	                  id: nextPopupId,
	                  amount: comboPoints,
	                  isCombo: comboIngredientMultipliers.size > 1,
	                  x: point.x,
	                  y: point.y,
	                  t: point.t,
                },
              ]
            : freshPopups;

        if (fragmentCutPoints > 0) {
          nextPopups.push({
            id: makeId('score-popup'),
            amount: fragmentCutPoints,
            isCombo: false,
            x: point.x,
            y: point.y,
            t: point.t,
          });
        }

	        return nextPopups.slice(-18);
	      },
	    );

    if (comboIngredientMultipliers.size > 1) {
      setComboBanner({
        id: makeId('combo-banner'),
        multiplier: comboIngredientMultipliers.size,
      });
    }

    const splitSources = [...ingredientTargets, ...fragmentTargetsOnly].map((target) =>
      target.kind === 'item'
        ? {
            key: target.item.key,
            clipStart: 0,
            clipEnd: 1,
            depth: 0,
            x: target.item.x,
            y: target.item.y,
            vx: target.item.vx,
            vy: target.item.vy,
            size: target.item.size,
            rotation: target.item.rotation,
            vr: target.item.vr,
          }
        : target.effect,
    );
    const newFragments = splitSources.flatMap((source) => splitSliceSource(source));
    const nextLock: SliceLock | null =
      newFragments.length > 0
        ? {
            fragmentIds: newFragments.map((fragment) => fragment.id),
            cursorX: point.x,
            cursorY: point.y,
            fallbackX: point.x,
            fallbackY: point.y,
            fallbackRadius: Math.max(
              ...[...ingredientTargets, ...fragmentTargetsOnly].map((target) => target.radius),
            ),
          }
        : null;
    const hitItemIds = new Set(
      [...ingredientTargets, ...penaltyCardTargets].map((target) => target.item.id),
    );
    const puncturedBallIds = new Set(
      badBallTargets.map((target) => target.item.id),
    );
    const hitEffectIds = new Set(
      targets.filter((target) => target.kind === 'fragment').map((target) => target.effect.id),
    );
    const nextItems = itemsRef.current
      .filter((item) => !hitItemIds.has(item.id))
      .map((item) => {
        if (item.kind !== 'bad-ball' || !puncturedBallIds.has(item.id)) {
          return item;
        }

        return {
          ...item,
          puncturedAt: point.t,
          vx: item.vx * 0.34,
          vy: Math.max(item.vy, 320),
          vr: item.vr + (item.vr >= 0 ? 540 : -540),
        };
      });
    const nextEffects = [
      ...sliceEffectsRef.current.filter((effect) => !hitEffectIds.has(effect.id)),
      ...newFragments,
    ];

    itemsRef.current = nextItems;
    sliceEffectsRef.current = nextEffects;
    sliceLockRef.current = nextLock;
    setItems(nextItems);
    setSliceEffects(nextEffects);
  }, []);

  const clientPointToArena = useCallback((clientX: number, clientY: number) => {
    const arena = arenaRef.current;
    const rect = arena?.getBoundingClientRect();

    if (!rect) {
      return null;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      t: performance.now(),
    };
  }, []);

  const registerPointerPoint = useCallback(
    (clientX: number, clientY: number) => {
      if (gamePaused) {
        activeComboRef.current = null;
        return;
      }

      const point = clientPointToArena(clientX, clientY);
	      if (!point) {
	        return;
	      }

      if (isPointInJuggleZone(point, arenaSize.height)) {
        jugglePointRef.current = pointerActiveRef.current ? point : null;
        activeComboRef.current = null;
        lastPointRef.current = null;
        sliceLockRef.current = null;
        spinAnglesRef.current.clear();
        setTrail([]);
        return;
      }

      jugglePointRef.current = null;

	      const previousPoint = lastPointRef.current;
      const recentPreviousPoint =
        previousPoint && point.t - previousPoint.t < 220 ? previousPoint : null;
      const movementDistance = previousPoint
        ? Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y)
        : 0;
      const currentLock = sliceLockRef.current;

      if (currentLock && isSliceLockReleased(currentLock, point, sliceEffectsRef.current)) {
        sliceLockRef.current = null;
      }

      lastPointRef.current = point;
	      if (!recentPreviousPoint || movementDistance < MIN_SLICE_MOVEMENT) {
	        if (
	          !recentPreviousPoint ||
	          (activeComboRef.current &&
	            point.t - activeComboRef.current.lastMovementAt > MOVEMENT_COMBO_RESET_MS)
	        ) {
	          activeComboRef.current = null;
          spinAnglesRef.current.clear();
	        }

	        return;
	      }

      registerSpinGesture(point, recentPreviousPoint);

	      if (
	        activeComboRef.current &&
	        point.t - activeComboRef.current.lastMovementAt > MOVEMENT_COMBO_RESET_MS
	      ) {
	        activeComboRef.current = null;
	      }

      if (!sliceLockRef.current) {
        sliceAt(point, recentPreviousPoint);
      }

      if (activeComboRef.current) {
        activeComboRef.current = {
          ...activeComboRef.current,
          lastMovementAt: point.t,
        };
      }

      setTrail((currentTrail) =>
        [
          ...currentTrail.filter((trailPoint) => point.t - trailPoint.t < TRAIL_LIFETIME_MS),
          point,
        ].slice(-12),
      );
    },
	    [arenaSize.height, clientPointToArena, gamePaused, registerSpinGesture, sliceAt],
	  );

  const handlePointerDown = useCallback(
	    (event: React.PointerEvent<HTMLElement>) => {
	      if (gamePaused) {
	        return;
	      }

      if (activePointerIdRef.current !== null) {
        return;
      }

	      pointerActiveRef.current = true;
      activePointerIdRef.current = event.pointerId;
	      lastPointRef.current = null;
	      activeComboRef.current = null;
	      event.currentTarget.setPointerCapture(event.pointerId);
      registerPointerPoint(event.clientX, event.clientY);
    },
    [gamePaused, registerPointerPoint],
  );

	  const handlePointerMove = useCallback(
	    (event: React.PointerEvent<HTMLElement>) => {
	      const canSliceWithoutPress = event.pointerType === 'mouse';
      const activePointerId = activePointerIdRef.current;

      if (activePointerId !== null && event.pointerId !== activePointerId) {
        return;
      }

	      if (!pointerActiveRef.current && !canSliceWithoutPress) {
	        return;
      }

      registerPointerPoint(event.clientX, event.clientY);
    },
    [registerPointerPoint],
  );

	  const handlePointerLeave = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (activePointerIdRef.current !== null && event.pointerId !== activePointerIdRef.current) {
      return;
    }

	    activeComboRef.current = null;
	    jugglePointRef.current = null;
    spinAnglesRef.current.clear();

    if (event.pointerType === 'mouse' && !pointerActiveRef.current) {
      lastPointRef.current = null;
      setTrail([]);
    }
  }, []);

	  const finishPointer = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (activePointerIdRef.current !== null && event.pointerId !== activePointerIdRef.current) {
      return;
    }

	    pointerActiveRef.current = false;
    activePointerIdRef.current = null;
	    jugglePointRef.current = null;
    spinAnglesRef.current.clear();
    lastPointRef.current = null;
    activeComboRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const clearActiveRound = useCallback(() => {
    pointerActiveRef.current = false;
    activePointerIdRef.current = null;
    jugglePointRef.current = null;
    spinAnglesRef.current.clear();
    lastPointRef.current = null;
    itemsRef.current = [];
    sliceEffectsRef.current = [];
    sliceLockRef.current = null;
    activeComboRef.current = null;
    setPauseOpen(false);
    setCountdownValue(null);
    setFinalRedCardVisible(false);
    setItems([]);
    setSliceEffects([]);
    setTrail([]);
    setPuncturedBalls([]);
    setScorePopups([]);
    setComboBanner(null);
    setUnlockToast(null);
  }, []);

  const resetAllProgress = useCallback(() => {
    const emptyProgress = createEmptyProgress();
    knownUnlockedRef.current = new Set();
    clearTutorialSeen();
    setProgress(emptyProgress);
    setTutorialSeen(false);
    setLives(INITIAL_LIVES);
    setGameOver(false);
    setSessionUnlockedRecipes([]);
    setRecipeNoticePending(false);
    setSelectedRecipe(null);
    setRecipesOpen(false);
    setConfirmMenuOpen(false);
    setTutorialOpen(false);
    clearActiveRound();
    setGameStarted(false);
  }, [clearActiveRound]);

  const startGame = useCallback(() => {
    knownUnlockedRef.current = new Set(
      RECIPES.filter((recipe) => isRecipeUnlocked(recipe, progress.inventory)).map(
        (recipe) => recipe.id,
      ),
    );
    clearActiveRound();
    setProgress((currentProgress) => ({
      score: 0,
      cuts: 0,
      inventory: currentProgress.inventory,
    }));
    setLives(INITIAL_LIVES);
    setGameOver(false);
    setSessionUnlockedRecipes([]);
    setGameStarted(true);
    setCountdownValue(3);
  }, [clearActiveRound, progress.inventory]);

  const requestStartGame = useCallback(() => {
    if (!tutorialSeen) {
      setTutorialOpen(true);
      return;
    }

    startGame();
  }, [startGame, tutorialSeen]);

  const completeTutorialAndStart = useCallback(() => {
    saveTutorialSeen();
    setTutorialSeen(true);
    setTutorialOpen(false);
    startGame();
  }, [startGame]);

  const openTutorialFromSettings = useCallback(() => {
    setSettingsOpen(false);
    setTutorialOpen(true);
  }, []);

  const requestReturnToMenu = useCallback(() => {
    setConfirmMenuOpen(true);
  }, []);

  const cancelReturnToMenu = useCallback(() => {
    setConfirmMenuOpen(false);
  }, []);

  const openPauseMenu = useCallback(() => {
    pointerActiveRef.current = false;
    activePointerIdRef.current = null;
    jugglePointRef.current = null;
    spinAnglesRef.current.clear();
    lastPointRef.current = null;
    activeComboRef.current = null;
    setTrail([]);
    setPauseOpen(true);
  }, []);

  const resumeGame = useCallback(() => {
    pointerActiveRef.current = false;
    activePointerIdRef.current = null;
    jugglePointRef.current = null;
    spinAnglesRef.current.clear();
    lastPointRef.current = null;
    activeComboRef.current = null;
    setTrail([]);
    setPauseOpen(false);
  }, []);

  const restartRound = useCallback(() => {
    knownUnlockedRef.current = new Set(
      RECIPES.filter((recipe) => isRecipeUnlocked(recipe, progress.inventory)).map(
        (recipe) => recipe.id,
      ),
    );
    clearActiveRound();
    setProgress((currentProgress) => ({
      score: 0,
      cuts: 0,
      inventory: currentProgress.inventory,
    }));
    setLives(INITIAL_LIVES);
    setGameOver(false);
    setSessionUnlockedRecipes([]);
    setGameStarted(true);
    setCountdownValue(3);
  }, [clearActiveRound, progress.inventory]);

  const confirmReturnToMenu = useCallback(() => {
    clearActiveRound();
    setLives(INITIAL_LIVES);
    setGameOver(false);
    setSessionUnlockedRecipes([]);
    setRecipesOpen(false);
    setSelectedRecipe(null);
    setConfirmMenuOpen(false);
    setGameStarted(false);
  }, [clearActiveRound]);

  const openRecipeBookAtRecipe = useCallback((recipe: Recipe) => {
    setRecipeNoticePending(false);
    setRecipesOpen(true);
    setSelectedRecipe(recipe);
  }, []);

  const openRecipeBook = useCallback(() => {
    setRecipeNoticePending(false);
    setRecipesOpen(true);
  }, []);

  return (
    <main className="game-shell">
      <section
        ref={arenaRef}
        className="arena"
        aria-label="Arena Copa dos Sabores"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onPointerLeave={handlePointerLeave}
      >
        {gameStarted ? (
          <div
            className="juggle-zone-divider"
            style={{ top: `${(1 - JUGGLE_ZONE_HEIGHT_RATIO) * 100}%` }}
            aria-hidden="true"
          />
        ) : null}

        {items.map((item) => {
          if (item.kind === 'penalty-card') {
            return (
              <div
                key={item.id}
                className="life-card-pickup"
                aria-label="Cartão de recuperação"
                style={
                  {
                    left: item.x,
                    top: item.y,
                    '--ingredient-size': `${item.size}px`,
                    transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
                  } as React.CSSProperties
                }
              >
                <span className="life-card-pickup-shape" aria-hidden="true" />
              </div>
            );
          }

          if (item.kind === 'bad-ball') {
            return (
              <div
                key={item.id}
                className={`bad-ball ${item.puncturedAt === null ? '' : 'is-punctured'}`}
                aria-label={item.puncturedAt === null ? 'Bola de futebol' : 'Bola de futebol furada'}
                style={
                  {
                    left: item.x,
                    top: item.y,
                    '--ingredient-size': `${item.size}px`,
                    transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
                  } as React.CSSProperties
                }
              >
                <span className="bad-ball-emoji" aria-hidden="true">
                  ⚽
                </span>
                {item.puncturedAt === null ? null : <span className="bad-ball-hole" aria-hidden="true" />}
              </div>
            );
          }

          const ingredient = INGREDIENT_BY_KEY[item.key];

          return (
            <div
              key={item.id}
              className={`ingredient ${getJuggleGlowClass(item.juggleCount)}`}
              aria-label={ingredient.label}
              style={
                {
                  left: item.x,
                  top: item.y,
                  '--ingredient-size': `${item.size}px`,
                  transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
                } as React.CSSProperties
              }
            >
              <span>{ingredient.emoji}</span>
            </div>
          );
        })}

        {sliceEffects.map((effect) => {
          const ingredient = INGREDIENT_BY_KEY[effect.key];
          const boxPosition = getFragmentBoxPosition(effect);

          return (
            <div
              className="slice-piece"
              key={effect.id}
              style={
                {
                  left: boxPosition.left,
                  top: boxPosition.top,
                  '--slice-size': `${effect.size}px`,
                  '--clip-left': `${effect.clipStart * 100}%`,
                  '--clip-right': `${(1 - effect.clipEnd) * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${effect.rotation}deg)`,
                } as React.CSSProperties
              }
              aria-hidden="true"
            >
              <span className="slice-fragment">
                <span>{ingredient.emoji}</span>
              </span>
            </div>
          );
        })}

	        {scorePopups.map((popup) => (
	          <div
	            className="score-popup"
	            key={popup.id}
	            style={
                {
                  left: popup.x,
                  top: popup.y,
                  '--score-popup-size': `${
                    popup.isCombo
                      ? Math.min(6.4, 3.4 + (popup.amount / POINTS_PER_SLICE_TARGET) * 0.48)
                      : Math.min(2.25, 1.35 + Math.max(0, popup.amount - 1) * 0.22)
                  }rem`,
                } as React.CSSProperties
              }
	            aria-hidden="true"
	          >
	            +{popup.amount}
	          </div>
	        ))}

        {comboBanner ? (
          <div className="combo-banner" key={comboBanner.id} aria-live="polite">
            <strong>COMBO</strong>
            <span>X{comboBanner.multiplier}</span>
          </div>
        ) : null}

        {countdownValue ? (
          <div className="countdown-overlay" key={countdownValue} aria-live="assertive">
            <span>{countdownValue === 'ja' ? 'Já!' : countdownValue}</span>
          </div>
        ) : null}

        {finalRedCardVisible ? (
          <div className="final-red-card-overlay" aria-live="assertive" role="status">
            <strong>Falta!</strong>
            <span className="final-red-card" aria-label="Cartão vermelho" />
          </div>
        ) : null}

        <svg
          className="slice-svg"
          viewBox={`0 0 ${arenaSize.width} ${arenaSize.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {trail.length > 1 ? (
            trail.slice(1).map((point, index) => {
              const previousPoint = trail[index];
              const recency = (index + 1) / (trail.length - 1);

              return (
                <line
                  key={`${previousPoint.t}-${point.t}`}
                  x1={previousPoint.x}
                  y1={previousPoint.y}
                  x2={point.x}
                  y2={point.y}
                  opacity={0.18 + recency * 0.82}
                  strokeWidth={2 + recency * 12}
                />
              );
            })
          ) : null}
        </svg>
      </section>

	      {gameStarted ? (
	        <>
	          <div className="top-hud" aria-live="polite">
	            <div
	              className="life-hud"
	              aria-label={`${INITIAL_LIVES - lives} cartões recebidos.`}
            >
              <span className="life-icons" aria-hidden="true">
                {Array.from({ length: INITIAL_LIVES }, (_, index) => (
                  <span
                    className={`penalty-card ${getPenaltyCardStateClass(index, lives)}`}
                    key={index}
                  />
	                ))}
	              </span>
	            </div>
	            <div className="score-card">
	              <Trophy size={28} aria-hidden="true" />
	              <span>
	                <strong>{progress.score}</strong>
	              </span>
	            </div>
	          </div>

          <div className="cup-badge" aria-hidden="true">
            <span>🏆</span>
            <strong>Copa dos Sabores</strong>
          </div>

	          <div className="bottom-hud">
	            <button
	              className="icon-button"
	              type="button"
	              onClick={openPauseMenu}
	              title="Pausar"
	              aria-label="Pausar jogo"
	            >
	              <Pause size={20} aria-hidden="true" />
	            </button>
	          </div>
        </>
	      ) : (
	        <section className="start-menu" aria-labelledby="start-menu-title">
          <button
            className="start-settings-button"
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Configurações"
            aria-label="Abrir configurações"
          >
            <Settings size={22} aria-hidden="true" />
          </button>
	          <div className="start-menu-content">
            <div className="start-brand-lockup" aria-label="Receitas + Copa do Mundo">
              <div className="start-logo">
                <img src={receitasLogoUrl} alt="Receitas" />
              </div>
              <span className="start-brand-plus" aria-hidden="true">
                +
              </span>
            </div>
	            <h1 id="start-menu-title">Copa dos Sabores</h1>
	          </div>
            <div className="start-actions">
              <button className="start-button primary" type="button" onClick={requestStartGame}>
                <Play size={22} aria-hidden="true" />
                <span>Iniciar</span>
              </button>
	              <button
	                className="start-button secondary start-recipes-button"
	                type="button"
	                onClick={openRecipeBook}
	                title="Receitas"
	                aria-label={`Abrir receitas: ${unlockedRecipes.length} de ${RECIPES.length} desbloqueadas`}
	              >
	                <BookOpen size={22} aria-hidden="true" />
	              </button>
              {recipeNoticePending ? (
                <button className="recipe-unlock-callout" type="button" onClick={openRecipeBook}>
                  Nova receita desbloqueada
                </button>
              ) : null}
	            </div>
	        </section>
	      )}

      {gameStarted && unlockToast ? (
        <UnlockToast recipe={unlockToast} onOpen={() => setSelectedRecipe(unlockToast)} />
      ) : null}

      {settingsOpen ? (
        <SettingsDialog
          onClose={() => setSettingsOpen(false)}
          onReset={resetAllProgress}
          onTutorial={openTutorialFromSettings}
        />
      ) : null}

      {tutorialOpen ? (
        <TutorialDialog onStart={completeTutorialAndStart} />
      ) : null}

      {pauseOpen ? (
	        <PauseDialog
	          onMenu={confirmReturnToMenu}
	          onRecipes={openRecipeBook}
	          onRestart={restartRound}
	          onResume={resumeGame}
	        />
      ) : null}

      {gameOver ? (
	        <GameOverDialog
	          allRecipesUnlocked={unlockedRecipes.length === RECIPES.length}
	          newRecipes={sessionUnlockedRecipes}
	          onMenu={confirmReturnToMenu}
	          onRecipeOpen={openRecipeBookAtRecipe}
	          onRecipes={openRecipeBook}
	          onRestart={startGame}
	          score={progress.score}
	          shareUrl={shareUrl}
	        />
      ) : null}

      {confirmMenuOpen ? (
        <ReturnToMenuDialog onCancel={cancelReturnToMenu} onConfirm={confirmReturnToMenu} />
      ) : null}

      {recipesOpen ? (
        <RecipeBook
          inventory={progress.inventory}
          unlockedCount={unlockedRecipes.length}
          onClose={() => setRecipesOpen(false)}
          onSelect={(recipe) => {
            setSelectedRecipe(recipe);
          }}
        />
      ) : null}

      {selectedRecipe ? (
        <RecipeDetail
          recipe={selectedRecipe}
          onClose={() => setSelectedRecipe(null)}
        />
      ) : null}

      {scrollHintVisible ? (
        <div className="scroll-hint-overlay" aria-live="polite" role="status">
          <div className="scroll-hint-message">
            <strong>Você pode rolar a página</strong>
            <span>Continue navegando para ver o restante do conteúdo.</span>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function UnlockToast({ recipe, onOpen }: { recipe: Recipe; onOpen: () => void }) {
  return (
    <button className="unlock-toast" type="button" onClick={onOpen} aria-live="assertive">
      <Unlock size={21} aria-hidden="true" />
      <span>{recipe.flag}</span>
      <strong>Receita desbloqueada</strong>
      <small>{recipe.name}</small>
    </button>
  );
}

function ReturnToMenuDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="confirm-backdrop" role="dialog" aria-modal="true" aria-labelledby="return-menu-title">
      <div className="confirm-dialog">
        <h2 id="return-menu-title">Voltar ao menu inicial?</h2>
        <p>O jogo será encerrado na tela atual, mas seus pontos e receitas continuam salvos.</p>
        <div className="confirm-actions">
          <button className="confirm-button secondary" type="button" onClick={onCancel}>
            Continuar
          </button>
          <button className="confirm-button primary" type="button" onClick={onConfirm}>
            Voltar
          </button>
        </div>
      </div>
    </div>
  );
}

function TutorialDialog({ onStart }: { onStart: () => void }) {
  const tutorialSteps = [
    {
      icon: '🍅',
      title: 'Corte os ingredientes',
      text: 'Arraste o dedo ou mouse na área de cima para cortar alimentos e marcar pontos.',
    },
    {
      icon: '🏆',
      title: 'Desbloqueie receitas',
      text: 'Cada ingrediente cortado entra no livro e ajuda a liberar novas receitas.',
    },
    {
      icon: '⚽',
      title: 'Evite a bola',
      text: 'Se cortar a bola, você recebe cartão. No terceiro cartão, o jogo acaba.',
    },
    {
      icon: '🟨',
      title: 'Pegue o cartão amarelo',
      text: 'Quando estiver com cartão marcado, corte o cartão amarelo para recuperar uma chance.',
    },
    {
      icon: '✨',
      title: 'Multiplique os pontos',
      text: 'Use a faixa de baixo para embaixadinhas ou circule ingredientes para aumentar o valor deles.',
    },
  ];

  return (
    <div className="tutorial-backdrop" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
      <section className="tutorial-dialog">
        <header className="tutorial-header">
          <div>
            <span>receitas +</span>
            <h2 id="tutorial-title">Como jogar</h2>
          </div>
        </header>

        <ol className="tutorial-steps">
          {tutorialSteps.map((step) => (
            <li key={step.title}>
              <span aria-hidden="true">{step.icon}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="tutorial-actions">
          <button className="confirm-button primary" type="button" onClick={onStart}>
            <Play size={22} aria-hidden="true" />
            <span>Iniciar jogo</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function SettingsDialog({
  onClose,
  onReset,
  onTutorial,
}: {
  onClose: () => void;
  onReset: () => void;
  onTutorial: () => void;
}) {
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  return (
    <div className="settings-backdrop" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="settings-dialog">
        <header className="settings-header">
          <h2 id="settings-title">Configurações</h2>
          <button className="icon-button dark" type="button" onClick={onClose} aria-label="Fechar">
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <button className="settings-help-button" type="button" onClick={onTutorial}>
          <BookOpen size={22} aria-hidden="true" />
          <span>Como jogar</span>
        </button>
        <button className="settings-reset-button" type="button" onClick={() => setConfirmResetOpen(true)}>
          <RotateCcw size={22} aria-hidden="true" />
          <span>Resetar tudo</span>
        </button>
      </div>
      {confirmResetOpen ? (
        <div
          className="reset-confirm-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-confirm-title"
        >
          <div className="reset-confirm-dialog">
            <h3 id="reset-confirm-title">Tem certeza?</h3>
            <p>Isso apaga recordes, pontuações, receitas e ingredientes coletados.</p>
            <div className="reset-confirm-actions">
              <button type="button" className="confirm-button secondary" onClick={() => setConfirmResetOpen(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="confirm-button primary"
                onClick={() => {
                  onReset();
                  onClose();
                }}
              >
                Resetar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PauseDialog({
  onMenu,
  onRecipes,
  onRestart,
  onResume,
}: {
  onMenu: () => void;
  onRecipes: () => void;
  onRestart: () => void;
  onResume: () => void;
}) {
  return (
	    <div className="pause-backdrop" role="dialog" aria-modal="true" aria-labelledby="pause-title">
	      <div className="pause-dialog">
	        <h2 id="pause-title">Pausa</h2>
	        <div className="pause-actions">
	          <button className="pause-action secondary pause-recipes-action" type="button" onClick={onRecipes}>
	            <BookOpen size={22} aria-hidden="true" />
	            <span>Receitas</span>
	          </button>
            <div className="pause-icon-actions">
              <button
                className="pause-icon-action secondary"
                type="button"
                onClick={onMenu}
                title="Menu"
                aria-label="Menu"
              >
                <Home size={22} aria-hidden="true" />
              </button>
              <button
                className="pause-icon-action secondary"
                type="button"
                onClick={onRestart}
                title="Reiniciar"
                aria-label="Reiniciar"
              >
                <RotateCcw size={22} aria-hidden="true" />
              </button>
              <button
                className="pause-icon-action primary"
                type="button"
                onClick={onResume}
                title="Voltar ao jogo"
                aria-label="Voltar ao jogo"
              >
                <Play size={24} aria-hidden="true" />
              </button>
            </div>
	        </div>
	      </div>
	    </div>
  );
}

function GameOverDialog({
  allRecipesUnlocked,
  newRecipes,
  onMenu,
  onRecipeOpen,
  onRecipes,
  onRestart,
  score,
  shareUrl,
}: {
  allRecipesUnlocked: boolean;
  newRecipes: Recipe[];
  onMenu: () => void;
  onRecipeOpen: (recipe: Recipe) => void;
  onRecipes: () => void;
  onRestart: () => void;
  score: number;
  shareUrl: string;
}) {
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const recentShareRecipes = useMemo(() => getRecentShareRecipes(newRecipes), [newRecipes]);
  const shareText = useMemo(
    () => getShareText(score, recentShareRecipes),
    [recentShareRecipes, score],
  );

  const handleDownload = useCallback(async () => {
    const blob = await createScoreShareImage({
      score,
      recipes: recentShareRecipes,
      shareUrl,
    });
    downloadBlob(blob, SHARE_IMAGE_FILENAME);
  }, [recentShareRecipes, score, shareUrl]);

  const handleShare = useCallback(async () => {
    if (!navigator.share) {
      setFallbackOpen(true);
      return;
    }

    setSharing(true);

    try {
      const blob = await createScoreShareImage({
        score,
        recipes: recentShareRecipes,
        shareUrl,
      });
      const file = new File([blob], SHARE_IMAGE_FILENAME, { type: 'image/png' });
      const shareData: ShareData = {
        title: GAME_TITLE,
        text: shareText,
        url: shareUrl,
      };
      const canShareImage =
        typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

      await navigator.share(
        canShareImage
          ? {
              ...shareData,
              files: [file],
            }
          : shareData,
      );
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setFallbackOpen(true);
      }
    } finally {
      setSharing(false);
    }
  }, [recentShareRecipes, score, shareText, shareUrl]);

  return (
    <div className="game-over-screen" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
      <div className="game-over-dialog">
        <h2 id="game-over-title">Fim de jogo</h2>
        <div className="final-brand-lockup" aria-label="Receitas + Copa do Mundo">
          <img src={receitasLogoUrl} alt="Receitas" />
          <span aria-hidden="true">+</span>
          <strong>Copa do Mundo</strong>
        </div>
        <div className="final-score" aria-label={`Pontuação final: ${score} pontos`}>
          <Trophy size={26} aria-hidden="true" />
          <span>
            <strong>{score}</strong>
            <small>pontos</small>
          </span>
        </div>
        <div className="new-recipes-summary">
          <strong>Receitas novas</strong>
          {newRecipes.length > 0 ? (
	            <ul>
	              {newRecipes.map((recipe) => (
	                <li key={recipe.id}>
                    <button
                      className="new-recipe-button"
                      type="button"
                      onClick={() => onRecipeOpen(recipe)}
                    >
	                    <span aria-hidden="true">{recipe.flag}</span>
	                    <strong>{recipe.name}</strong>
                    </button>
	                </li>
	              ))}
	            </ul>
          ) : allRecipesUnlocked ? (
            <p>Todas as receitas adquiridas.</p>
          ) : (
            <p>Nenhuma receita nova nesta rodada.</p>
	          )}
	        </div>
        <div className="result-share-actions">
          <button className="result-share-button secondary" type="button" onClick={handleDownload}>
            <Download size={21} aria-hidden="true" />
            <span>Download</span>
          </button>
          <button
            className="result-share-button secondary"
            type="button"
            onClick={handleShare}
            disabled={sharing}
          >
            <Share2 size={21} aria-hidden="true" />
            <span>{sharing ? 'Abrindo...' : 'Compartilhar'}</span>
          </button>
        </div>
        <div className="confirm-actions game-over-actions">
          <button
            className="confirm-button secondary"
            type="button"
            onClick={onMenu}
            title="Voltar ao menu"
            aria-label="Voltar ao menu"
          >
            <Home size={22} aria-hidden="true" />
          </button>
          <button
            className="confirm-button secondary"
            type="button"
            onClick={onRecipes}
            title="Receitas"
            aria-label="Abrir receitas"
          >
            <BookOpen size={22} aria-hidden="true" />
          </button>
          <button
            className="confirm-button primary"
            type="button"
            onClick={onRestart}
            title="Jogar novamente"
            aria-label="Jogar novamente"
          >
            <Play size={24} aria-hidden="true" />
          </button>
	        </div>
	      </div>
      {fallbackOpen ? (
        <ShareFallbackDialog
          onClose={() => setFallbackOpen(false)}
          shareText={shareText}
          shareUrl={shareUrl}
        />
      ) : null}
	    </div>
	  );
}

function ShareFallbackDialog({
  onClose,
  shareText,
  shareUrl,
}: {
  onClose: () => void;
  shareText: string;
  shareUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  const copyLink = useCallback(async () => {
    await copyTextToClipboard(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }, [shareUrl]);

  const shareOnWhatsApp = useCallback(() => {
    const message = encodeURIComponent(`${shareText} ${shareUrl}`);
    window.open(`https://wa.me/?text=${message}`, '_blank', 'noopener,noreferrer');
  }, [shareText, shareUrl]);

  return (
    <div className="share-fallback-backdrop" role="dialog" aria-modal="true" aria-labelledby="share-fallback-title">
      <div className="share-fallback-dialog">
        <header className="share-fallback-header">
          <h3 id="share-fallback-title">Compartilhar</h3>
          <button className="icon-button dark" type="button" onClick={onClose} aria-label="Fechar">
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="share-fallback-actions">
          <button className="share-fallback-button" type="button" onClick={copyLink}>
            <Copy size={21} aria-hidden="true" />
            <span>{copied ? 'Link copiado' : 'Copiar link'}</span>
          </button>
          <button className="share-fallback-button primary" type="button" onClick={shareOnWhatsApp}>
            <MessageCircle size={21} aria-hidden="true" />
            <span>WhatsApp</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function RecipeBook({
  inventory,
  unlockedCount,
  onClose,
  onSelect,
}: {
  inventory: Inventory;
  unlockedCount: number;
  onClose: () => void;
  onSelect: (recipe: Recipe) => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Livro de receitas">
      <div className="recipe-panel">
        <header className="panel-header">
          <ChefHat size={28} aria-hidden="true" />
          <div>
            <h2>Livro de receitas</h2>
            <p>
              {unlockedCount}/{RECIPES.length} liberadas
            </p>
          </div>
          <button className="icon-button dark" type="button" onClick={onClose} aria-label="Fechar">
            <X size={22} aria-hidden="true" />
	          </button>
	        </header>
	
	        <div className="recipe-grid">
	          {RECIPES.map((recipe) => {
	            const unlocked = isRecipeUnlocked(recipe, inventory);
	
	            return (
	              <button
                className={`recipe-card ${unlocked ? 'is-unlocked' : 'is-locked'}`}
                key={recipe.id}
                type="button"
                onClick={() => unlocked && onSelect(recipe)}
                disabled={!unlocked}
		              >
                    {unlocked ? (
                      <>
                        <span className="recipe-status">
                          <Unlock size={18} aria-hidden="true" />
                          <small>Liberada</small>
                        </span>
                        <span className="recipe-title">
                          <span>{recipe.flag}</span>
                          <span>
                            <strong>{recipe.name}</strong>
                            <small>{recipe.country}</small>
                          </span>
                        </span>
                      </>
                    ) : (
                      <div className="locked-recipe-content">
                        <div className="locked-recipe-header">
                          <span className="locked-recipe-country">
                            <span className="locked-recipe-flag">{recipe.flag}</span>
                            <strong>{recipe.country}</strong>
                          </span>
                          <span className="recipe-status">
                            <Lock size={18} aria-hidden="true" />
                            <small>Bloqueada</small>
                          </span>
                        </div>
                        <div className="locked-recipe-needs" aria-label="Ingredientes necessários">
                          {recipeEntries(recipe).map(([key, amount]) => {
                            const ingredient = INGREDIENT_BY_KEY[key];
                            const current = inventory[key];

                            return (
                              <span className="locked-need-chip" key={key}>
                                <span>{ingredient.emoji}</span>
                                <small>
                                  {current}/{amount}
                                </small>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
	              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RecipeDetail({
  recipe,
  onClose,
}: {
  recipe: Recipe;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop detail-layer" role="dialog" aria-modal="true" aria-label={recipe.name}>
      <article className="recipe-detail">
        <header className="detail-header">
          <div>
            <span className="detail-flag">{recipe.flag}</span>
            <h2>{recipe.name}</h2>
          </div>
          <button className="icon-button dark" type="button" onClick={onClose} aria-label="Fechar">
            <X size={22} aria-hidden="true" />
          </button>
        </header>

        <div className={`recipe-detail-image ${recipe.imageUrl ? '' : 'is-empty'}`}>
          {recipe.imageUrl ? (
            <img src={recipe.imageUrl} alt={recipe.name} />
          ) : (
            <span aria-hidden="true">{recipe.flag}</span>
          )}
        </div>

        <section className="detail-section">
          <h3>Ingredientes</h3>
          <div className="detail-ingredients">
            {recipeEntries(recipe).map(([key, amount]) => {
              const ingredient = INGREDIENT_BY_KEY[key];

              return (
                <span className="detail-ingredient" key={key}>
                  <span>{ingredient.emoji}</span>
                  <strong>{ingredient.label}</strong>
                  <small>{amount} necessários</small>
                </span>
              );
            })}
          </div>
        </section>

        <section className="detail-section">
          <h3>Modo de preparo</h3>
          <ol>
            {recipe.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      </article>
    </div>
  );
}
