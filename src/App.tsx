import {
  BookOpen,
  ChefHat,
  Lock,
  RotateCcw,
  Sparkles,
  Trophy,
  Unlock,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'copa-dos-sabores-progress-v1';

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
  subtitle: string;
  accent: string;
  ingredients: Partial<Record<IngredientKey, number>>;
  steps: string[];
};

type FallingIngredient = {
  id: string;
  key: IngredientKey;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  vr: number;
  size: number;
};

type SliceEffect = {
  id: string;
  key: IngredientKey;
  x: number;
  y: number;
  createdAt: number;
};

type TrailPoint = {
  x: number;
  y: number;
  t: number;
};

type Progress = {
  score: number;
  cuts: number;
  inventory: Inventory;
};

const INGREDIENTS: readonly Ingredient[] = ingredientCatalog;

const INGREDIENT_BY_KEY = Object.fromEntries(
  INGREDIENTS.map((ingredient) => [ingredient.key, ingredient]),
) as Record<IngredientKey, Ingredient>;

const RECIPES: Recipe[] = [
  {
    id: 'brasil-feijoada',
    country: 'Brasil',
    flag: '🇧🇷',
    name: 'Feijoada da Torcida',
    subtitle: 'Panela forte para dia de decisão',
    accent: '#1f8a4c',
    ingredients: { beans: 3, beef: 2, onion: 1, rice: 1 },
    steps: [
      'Refogue a cebola com a carne até dourar.',
      'Junte o feijão cozido e deixe encorpar.',
      'Sirva com arroz quente e finalize como prato de arquibancada.',
    ],
  },
  {
    id: 'argentina-empanadas',
    country: 'Argentina',
    flag: '🇦🇷',
    name: 'Empanadas de Final',
    subtitle: 'Recheio intenso para prorrogação',
    accent: '#5ba6d6',
    ingredients: { beef: 2, onion: 2, egg: 1, pepper: 1 },
    steps: [
      'Refogue carne, cebola e pimentão até ficar suculento.',
      'Misture ovo picado ao recheio frio.',
      'Feche a massa em meia-lua e asse até dourar.',
    ],
  },
  {
    id: 'mexico-tacos',
    country: 'México',
    flag: '🇲🇽',
    name: 'Tacos de Estádio',
    subtitle: 'Crocrância, cor e comemoração',
    accent: '#d94836',
    ingredients: { corn: 2, chicken: 2, cheese: 1, tomato: 1, pepper: 1 },
    steps: [
      'Grelhe o frango em tiras com pimentão.',
      'Monte nas tortilhas de milho com tomate fresco.',
      'Finalize com queijo e sirva ainda quente.',
    ],
  },
  {
    id: 'japao-omurice',
    country: 'Japão',
    flag: '🇯🇵',
    name: 'Omurice Nipônico',
    subtitle: 'Arroz, ovo e precisão de camisa 10',
    accent: '#c73645',
    ingredients: { rice: 2, egg: 2, chicken: 1, tomato: 1 },
    steps: [
      'Salteie arroz com frango e tomate.',
      'Prepare uma omelete macia em frigideira antiaderente.',
      'Cubra o arroz com a omelete e sirva imediatamente.',
    ],
  },
  {
    id: 'franca-ratatouille',
    country: 'França',
    flag: '🇫🇷',
    name: 'Ratatouille dos Campeões',
    subtitle: 'Legumes alinhados como defesa compacta',
    accent: '#2c5fba',
    ingredients: { tomato: 2, onion: 1, pepper: 2, carrot: 2 },
    steps: [
      'Corte os legumes em pedaços parecidos.',
      'Refogue cebola e tomate até formar uma base aromática.',
      'Cozinhe pimentão e cenoura até ficarem macios.',
    ],
  },
  {
    id: 'italia-carbonara',
    country: 'Itália',
    flag: '🇮🇹',
    name: 'Carbonara Azzurra',
    subtitle: 'Massa cremosa para cantar no intervalo',
    accent: '#237a52',
    ingredients: { pasta: 3, egg: 2, cheese: 2 },
    steps: [
      'Cozinhe a massa até ficar al dente.',
      'Misture ovos e queijo fora do fogo.',
      'Envolva a massa quente no creme e sirva na hora.',
    ],
  },
  {
    id: 'alemanha-batata',
    country: 'Alemanha',
    flag: '🇩🇪',
    name: 'Salada de Batata da Área',
    subtitle: 'Simples, precisa e pronta para pressão',
    accent: '#d4a72c',
    ingredients: { potato: 3, egg: 1, onion: 1 },
    steps: [
      'Cozinhe batatas em cubos até ficarem firmes.',
      'Misture com ovo cozido e cebola bem picada.',
      'Tempere e leve à geladeira antes de servir.',
    ],
  },
  {
    id: 'marrocos-cuscuz',
    country: 'Marrocos',
    flag: '🇲🇦',
    name: 'Cuscuz de Contra-Ataque',
    subtitle: 'Aromático, rápido e cheio de textura',
    accent: '#b63838',
    ingredients: { corn: 2, carrot: 2, chicken: 1, onion: 1, pepper: 1 },
    steps: [
      'Hidrate o cuscuz de milho até ficar soltinho.',
      'Refogue frango, cenoura, cebola e pimentão.',
      'Misture tudo e finalize com um fio de azeite.',
    ],
  },
];

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

function recipeEntries(recipe: Recipe) {
  return Object.entries(recipe.ingredients) as Array<[IngredientKey, number]>;
}

function isRecipeUnlocked(recipe: Recipe, inventory: Inventory) {
  return recipeEntries(recipe).every(([key, amount]) => inventory[key] >= amount);
}

function getRecipeProgress(recipe: Recipe, inventory: Inventory) {
  const entries = recipeEntries(recipe);
  const needed = entries.reduce((sum, [, amount]) => sum + amount, 0);
  const collected = entries.reduce(
    (sum, [key, amount]) => sum + Math.min(inventory[key], amount),
    0,
  );

  return Math.round((collected / needed) * 100);
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

function createFallingIngredient(arenaWidth: number, arenaHeight: number): FallingIngredient {
  const ingredient = pickIngredient();
  const margin = Math.min(96, Math.max(46, arenaWidth * 0.12));
  const baseSize = arenaWidth < 560 ? 58 : 72;

  return {
    id: makeId('ingredient'),
    key: ingredient.key,
    x: margin + Math.random() * Math.max(1, arenaWidth - margin * 2),
    y: arenaHeight + 80,
    vx: (Math.random() - 0.5) * 180,
    vy: -720 - Math.random() * 280,
    rotation: Math.random() * 90 - 45,
    vr: (Math.random() - 0.5) * 300,
    size: baseSize + Math.random() * 18,
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

export default function App() {
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [items, setItems] = useState<FallingIngredient[]>([]);
  const [sliceEffects, setSliceEffects] = useState<SliceEffect[]>([]);
  const [trail, setTrail] = useState<TrailPoint[]>([]);
  const [arenaSize, setArenaSize] = useState({ width: 1, height: 1 });
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [unlockToast, setUnlockToast] = useState<Recipe | null>(null);

  const arenaRef = useRef<HTMLElement | null>(null);
  const itemsRef = useRef<FallingIngredient[]>([]);
  const pointerActiveRef = useRef(false);
  const lastPointRef = useRef<TrailPoint | null>(null);
  const knownUnlockedRef = useRef<Set<string> | null>(null);

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

  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  useEffect(() => {
    const currentUnlocked = RECIPES.filter((recipe) =>
      isRecipeUnlocked(recipe, progress.inventory),
    );
    const knownUnlocked = knownUnlockedRef.current ?? new Set<string>();
    const freshUnlock = currentUnlocked.find((recipe) => !knownUnlocked.has(recipe.id));

    if (freshUnlock) {
      setUnlockToast(freshUnlock);
    }

    knownUnlockedRef.current = new Set(currentUnlocked.map((recipe) => recipe.id));
  }, [progress.inventory]);

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
    let frame = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.034, (now - lastTime) / 1000);
      lastTime = now;

      setItems((currentItems) => {
        const nextItems = currentItems
          .map((item) => {
            const gravity = arenaSize.width < 620 ? 1110 : 1260;

            return {
              ...item,
              x: item.x + item.vx * dt,
              y: item.y + item.vy * dt,
              vy: item.vy + gravity * dt,
              rotation: item.rotation + item.vr * dt,
            };
          })
          .filter(
            (item) =>
              item.y < arenaSize.height + item.size * 1.8 &&
              item.x > -120 &&
              item.x < arenaSize.width + 120,
          );

        itemsRef.current = nextItems;
        return nextItems;
      });

      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [arenaSize.height, arenaSize.width]);

  useEffect(() => {
    let timeout = 0;
    let cancelled = false;

    const schedule = () => {
      const delay = 560 + Math.random() * 520;

      timeout = window.setTimeout(() => {
        if (cancelled) {
          return;
        }

        setItems((currentItems) => {
          const openSlots = Math.max(0, 12 - currentItems.length);
          const amount = Math.min(openSlots, Math.random() > 0.78 ? 2 : 1);
          const nextItems = [
            ...currentItems,
            ...Array.from({ length: amount }, () =>
              createFallingIngredient(arenaSize.width, arenaSize.height),
            ),
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
  }, [arenaSize.height, arenaSize.width]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = performance.now();
      const createdCutoff = Date.now() - 650;

      setTrail((currentTrail) => currentTrail.filter((point) => now - point.t < 260));
      setSliceEffects((currentEffects) =>
        currentEffects.filter((effect) => effect.createdAt > createdCutoff),
      );
    }, 80);

    return () => window.clearInterval(interval);
  }, []);

  const sliceAt = useCallback((point: TrailPoint, previousPoint: TrailPoint | null) => {
    const hitItems = itemsRef.current.filter((item) => {
      const directDistance = Math.hypot(item.x - point.x, item.y - point.y);
      const segmentDistance = previousPoint
        ? distanceToSegment(item.x, item.y, previousPoint.x, previousPoint.y, point.x, point.y)
        : directDistance;

      return Math.min(directDistance, segmentDistance) <= item.size * 0.62;
    });

    if (hitItems.length === 0) {
      return;
    }

    const hitIds = new Set(hitItems.map((item) => item.id));
    const nextItems = itemsRef.current.filter((item) => !hitIds.has(item.id));
    itemsRef.current = nextItems;
    setItems(nextItems);

    setProgress((currentProgress) => {
      const inventory = { ...currentProgress.inventory };
      let score = currentProgress.score;

      for (const item of hitItems) {
        inventory[item.key] += 1;
        score += INGREDIENT_BY_KEY[item.key].score;
      }

      return {
        score,
        cuts: currentProgress.cuts + hitItems.length,
        inventory,
      };
    });

    const createdAt = Date.now();
    setSliceEffects((currentEffects) => [
      ...currentEffects,
      ...hitItems.map((item) => ({
        id: makeId('slice'),
        key: item.key,
        x: item.x,
        y: item.y,
        createdAt,
      })),
    ]);
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
      const point = clientPointToArena(clientX, clientY);
      if (!point) {
        return;
      }

      const previousPoint = lastPointRef.current;
      lastPointRef.current = point;
      sliceAt(point, previousPoint);
      setTrail((currentTrail) => [...currentTrail.filter((trailPoint) => point.t - trailPoint.t < 260), point].slice(-12));
    },
    [clientPointToArena, sliceAt],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      pointerActiveRef.current = true;
      lastPointRef.current = null;
      event.currentTarget.setPointerCapture(event.pointerId);
      registerPointerPoint(event.clientX, event.clientY);
    },
    [registerPointerPoint],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!pointerActiveRef.current) {
        return;
      }

      registerPointerPoint(event.clientX, event.clientY);
    },
    [registerPointerPoint],
  );

  const finishPointer = useCallback((event: React.PointerEvent<HTMLElement>) => {
    pointerActiveRef.current = false;
    lastPointRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const resetProgress = useCallback(() => {
    const confirmed = window.confirm('Zerar placar, cortes e receitas desbloqueadas?');
    if (!confirmed) {
      return;
    }

    const emptyProgress = createEmptyProgress();
    knownUnlockedRef.current = new Set();
    itemsRef.current = [];
    setProgress(emptyProgress);
    setItems([]);
    setSliceEffects([]);
    setTrail([]);
    setUnlockToast(null);
    setSelectedRecipe(null);
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
      >
        <div className="field-lines" aria-hidden="true">
          <span className="field-line field-line-center" />
          <span className="field-circle" />
          <span className="field-box field-box-left" />
          <span className="field-box field-box-right" />
        </div>

        {items.map((item) => {
          const ingredient = INGREDIENT_BY_KEY[item.key];

          return (
            <div
              key={item.id}
              className="ingredient"
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

          return (
            <div
              className="slice-pop"
              key={effect.id}
              style={{ left: effect.x, top: effect.y }}
              aria-hidden="true"
            >
              <span>{ingredient.emoji}</span>
              <i />
            </div>
          );
        })}

        <svg
          className="slice-svg"
          viewBox={`0 0 ${arenaSize.width} ${arenaSize.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {trail.length > 1 ? (
            <polyline points={trail.map((point) => `${point.x},${point.y}`).join(' ')} />
          ) : null}
        </svg>
      </section>

      <div className="top-hud" aria-live="polite">
        <div className="score-card">
          <Trophy size={21} aria-hidden="true" />
          <span>
            <strong>{progress.score}</strong>
            <small>Pontos</small>
          </span>
        </div>
        <div className="score-card">
          <Sparkles size={21} aria-hidden="true" />
          <span>
            <strong>{progress.cuts}</strong>
            <small>Cortes</small>
          </span>
        </div>
        <div className="score-card">
          <ChefHat size={21} aria-hidden="true" />
          <span>
            <strong>
              {unlockedRecipes.length}/{RECIPES.length}
            </strong>
            <small>Receitas</small>
          </span>
        </div>
      </div>

      <div className="cup-badge" aria-hidden="true">
        <span>🏆</span>
        <strong>Copa dos Sabores</strong>
      </div>

      <div className="bottom-hud">
        <button className="hud-action" type="button" onClick={() => setRecipesOpen(true)}>
          <BookOpen size={20} aria-hidden="true" />
          <span>Receitas</span>
          <strong>
            {unlockedRecipes.length}/{RECIPES.length}
          </strong>
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={resetProgress}
          title="Zerar progresso"
          aria-label="Zerar progresso"
        >
          <RotateCcw size={20} aria-hidden="true" />
        </button>
      </div>

      {unlockToast ? <UnlockToast recipe={unlockToast} onOpen={() => setSelectedRecipe(unlockToast)} /> : null}

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
          inventory={progress.inventory}
          onClose={() => setSelectedRecipe(null)}
        />
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

        <div className="ingredient-bank" aria-label="Ingredientes cortados">
          {INGREDIENTS.map((ingredient) => (
            <span className="bank-chip" key={ingredient.key}>
              <span>{ingredient.emoji}</span>
              <strong>{inventory[ingredient.key]}</strong>
            </span>
          ))}
        </div>

        <div className="recipe-grid">
          {RECIPES.map((recipe) => {
            const unlocked = isRecipeUnlocked(recipe, inventory);
            const progress = getRecipeProgress(recipe, inventory);

            return (
              <button
                className={`recipe-card ${unlocked ? 'is-unlocked' : 'is-locked'}`}
                key={recipe.id}
                type="button"
                onClick={() => unlocked && onSelect(recipe)}
                disabled={!unlocked}
                style={{ '--recipe-accent': recipe.accent } as React.CSSProperties}
              >
                <span className="recipe-status">
                  {unlocked ? <Unlock size={18} aria-hidden="true" /> : <Lock size={18} aria-hidden="true" />}
                  {unlocked ? 'Liberada' : `${progress}%`}
                </span>
                <span className="recipe-title">
                  <span>{recipe.flag}</span>
                  <span>
                    <strong>{recipe.name}</strong>
                    <small>{recipe.country}</small>
                  </span>
                </span>
                <span className="recipe-progress" aria-hidden="true">
                  <i style={{ width: `${progress}%` }} />
                </span>
                <span className="recipe-needs">
                  {recipeEntries(recipe).map(([key, amount]) => {
                    const ingredient = INGREDIENT_BY_KEY[key];
                    const current = inventory[key];
                    const complete = current >= amount;

                    return (
                      <span className={complete ? 'need-chip is-complete' : 'need-chip'} key={key}>
                        <span>{ingredient.emoji}</span>
                        <small>
                          {current}/{amount}
                        </small>
                      </span>
                    );
                  })}
                </span>
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
  inventory,
  onClose,
}: {
  recipe: Recipe;
  inventory: Inventory;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop detail-layer" role="dialog" aria-modal="true" aria-label={recipe.name}>
      <article className="recipe-detail" style={{ '--recipe-accent': recipe.accent } as React.CSSProperties}>
        <header className="detail-header">
          <div>
            <span className="detail-flag">{recipe.flag}</span>
            <h2>{recipe.name}</h2>
            <p>{recipe.subtitle}</p>
          </div>
          <button className="icon-button dark" type="button" onClick={onClose} aria-label="Fechar">
            <X size={22} aria-hidden="true" />
          </button>
        </header>

        <section className="detail-section">
          <h3>Ingredientes</h3>
          <div className="detail-ingredients">
            {recipeEntries(recipe).map(([key, amount]) => {
              const ingredient = INGREDIENT_BY_KEY[key];

              return (
                <span className="detail-ingredient" key={key}>
                  <span>{ingredient.emoji}</span>
                  <strong>{ingredient.label}</strong>
                  <small>
                    {amount} necessários · {inventory[key]} cortados
                  </small>
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
