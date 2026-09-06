---
created: 2026-09-07
status: draft
branch: dev
size: L
---

# Tech Spec: Играбельный вертикальный срез Акта I «Сиреневый сад»

## Solution

Строим один новый Phaser Scene (`Act1LilacGarden`) поверх пустого каркаса. Вся игровая логика, которую можно проверить без запущенного движка (выбор схемы, готовность сцены, поиск точки прилипания, тайминг сигнала скрытой точки, запись сохранения), выносится в Phaser-свободные модули (`src/logic/`, `src/save/`) и покрывается юнит-тестами; сама сцена — тонкая обвязка, которая читает data-driven конфиг (`src/config/act1.ts`) и дергает эти модули. Магнитное прилипание — не Zones/Arcade Physics, а ручная дистанционная проверка по массиву точек (обоснование и API — `code-research.md` §1). Декорации — Phaser Graphics/Container плейсхолдеры, единственные файловые ассеты — два спрайта персонажей, подготовленные отдельным one-off скриптом из локальных модельных листов `artbook/`. Ориентация определяется через `matchMedia`, а не через Phaser Scale Manager (обоснование — Decisions, раздел Orientation). Звук — осцилляторы поверх `AudioContext`, доступного как `(scene.sound as Phaser.Sound.WebAudioSoundManager).context`.

Технические решения по механике (магнит, hold-to-drag, порядок выдачи, коты как один предмет, BASE_URL, отказ от лабиринта/комиксов/lock-камеры, звук осцилляторами, семантика сигнала скрытой точки, save write-only) уже приняты и обоснованы пользователем в user-spec.md → «Технические решения» (14 пунктов) — они не пересматриваются здесь, а формализуются в разделе Decisions ниже со ссылкой на конкретный пункт. Этот tech-spec добавляет то, что user-spec явно делегировал ему: точные числовые константы (радиусы, тайминги, минимальный вьюпорт), структуру файлов/модулей и выбор конкретных Phaser/Node API.

## Architecture

### What we're building/modifying

- **`src/scenes/Act1LilacGarden.ts`** (new) — вся игровая сцена: выдача предметов из ящика, драг+магнит, особый случай ключевого предмета, автоподсказка+кнопка подсказки, пульт+постановка, реакции окружения, экраны «продолжить/переставить».
- **`src/types/placement.ts`** (new) — типы: `SchemeId`, `PropRole`, `PropVisual`, `DropPoint`, `PropDef`, `EnvironmentDef`, `OutcomeDef`, `ActConfig`.
- **`src/config/act1.ts`** (new) — data-driven конфиг Акта I: 8 перетаскиваемых предметов (порядок из раскадровки), статичное окружение (лавочка/качеля/самокат), обе постановки.
- **`src/logic/placement.ts`** (new) — Phaser-свободные чистые функции: `resolveScheme`, `activePointsFor`, `findSnapTarget`, `isSceneReady`, `nextHintTarget`, `hiddenPointDwellState`.
- **`src/save/index.ts`** (modified) — `SaveData`, `defaultSave()`, `saveAct1Result(scheme)`. `loadSave` не реализуется в этом срезе (см. Decisions).
- **`src/audio/sfx.ts`** (new) — синтезированные звуки (`playSnap`, `playHintChime`, `playScooterBeep`) через `AudioContext`, без аудиофайлов.
- **`src/ui/orientationGuard.ts`** (new) + **`index.html`** (modified) — DOM-оверлей «поверни телефон», управляемый `matchMedia('(orientation: portrait)')`.
- **`scripts/prepare-sprites.mjs`** (new) — one-off скрипт обрезки+альфа-маскирования спрайтов Мишки и Огонька из `artbook/` в `public/assets/`.
- **`src/config/gameConfig.ts`**, **`src/scenes/Preload.ts`** (modified) — регистрация сцены, загрузка спрайтов через `import.meta.env.BASE_URL`, переход Preload → Act1LilacGarden.
- **`tests/unit/gameConfig.test.ts`** (modified), **`tests/unit/placement.test.ts`**, **`tests/unit/save.test.ts`** (new).

### How it works

Открытие страницы → `matchMedia` проверяется независимо от загрузки Phaser (может показать оверлей ещё до `Boot`); при landscape игра идёт как обычно. `Boot` → `Preload` (грузит `teddy.png`/`ogonek.png` через `BASE_URL`) → `Act1LilacGarden`. Сцена читает `ACT1_CONFIG`, рисует статичное окружение и первый предмет из ящика (порядок — из конфига). При драге сцена на каждом кадре вызывает чистую `findSnapTarget`/`activePointsFor` (фильтр по текущему `activeScheme`), применяет магнитное смещение, по отпусканию — доводка/сжатие/крошки/`sfx.playSnap()` либо возврат в ящик. Как только `resolveScheme` впервые возвращает не `null` (куст установлен), сцена выдаёт котов. `isSceneReady` включает пульт; клик по пульту проигрывает `OutcomeDef` выбранной схемы (плейсхолдер-биты + реакция окружения по фиксированному контракту из Decisions), ввод заблокирован на всё время. «Продолжить» вызывает `saveAct1Result` и показывает текстовую заглушку; «переставить» сбрасывает только куст+котов и повторно проверяет готовность без повторного показа подсказок. Обновление страницы всегда перезапускает `Boot → Preload → Act1LilacGarden` с нуля — чтение сохранения в этом срезе не реализовано, поэтому восстанавливать нечему. Флип ориентации в портрет в любой момент показывает тот же DOM-оверлей и отменяет незавершённый драг через колбэк из `orientationGuard`.

### Shared resources

| Resource                                         | Owner (creates)                                                            | Consumers                                               | Instance count                    |
| ------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------- |
| `AudioContext` (`this.sound.context`)            | `Phaser.Game` → `WebAudioSoundManager`, создаётся один раз при старте игры | `src/audio/sfx.ts`, вызывается из `Act1LilacGarden`     | 1 (управляется Phaser)            |
| `ACT1_CONFIG` (`src/config/act1.ts`)             | модульная константа                                                        | `Act1LilacGarden`, `src/logic/placement.ts`, юнит-тесты | 1 (импортируется, не клонируется) |
| `matchMedia('(orientation: portrait)')` listener | `src/ui/orientationGuard.ts`, регистрируется один раз из `main.ts`         | DOM-оверлей, `Act1LilacGarden` (гейтинг ввода)          | 1                                 |

## Decisions

Пункты 1–14 формализуют решения, уже принятые и обоснованные пользователем в `user-spec.md` → «Технические решения» — здесь только ссылка на источник, без пересмотра. Пункты 15+ — решения этого tech-spec, заполняющие то, что user-spec явно делегировал техническому уровню (точные числа, выбор API, структура файлов).

### Decision 1: Магнит — дистанционная проверка по точкам, не Zones/Arcade Physics

**Decision:** Ручной `Math.hypot`/`Phaser.Math.Distance` по массиву `DropPoint`, без `Phaser.GameObjects.Zone` и без Arcade Physics.
**Rationale:** зоны тестируются по указателю, а не по центру объекта, не умеют выбирать ближайшую из нескольких точек, требуют пересоздания при смене схемы (`code-research.md` §1).
**Supports:** user-spec «Технические решения» п.1; AC «Магнитное притяжение не мерцает…».

### Decision 2: Hold-to-drag ключевого предмета — только после установки котов

**Decision:** `time.delayedCall(500, …)` на конкретном объекте куста переключает `setDraggable`, а не глобальный `input.dragTimeThreshold`. Порог активен только когда `catsPlaced === true`; первичная выдача куста из ящика тащится как обычный предмет, без задержки.
**Rationale:** глобальный порог задел бы все предметы; user-spec шаг 5 явно скопирует правило удержания только к переносу «после того, как коты уже установлены» — до этого различать тап/драг не от чего (куст ещё не размещён).
**Supports:** user-spec «Как должно работать» шаг 5, «Технические решения» п.2.

### Decision 3: Игровые правила — в Phaser-свободных модулях

**Decision:** `resolveScheme`, `activePointsFor`, `findSnapTarget`, `isSceneReady`, `nextHintTarget`, `hiddenPointDwellState` — чистые функции без импорта работающего `Phaser.Game`/Scene lifecycle.
**Rationale:** импорт `phaser` под Vitest/jsdom работает, а жизненный цикл сцены — нет (`code-research.md` §5).
**Supports:** user-spec «Ограничения» (тестируемая логика без прямой зависимости от Phaser-движка), «Технические решения» п.3.

### Decision 4: Порядок выдачи — по раскадровке

**Decision:** дорожка → фонтан → низкий куст → арка → высокий куст → фонарь 1 → фонарь 2 → коты.
**Rationale:** раскадровка задаёт пространство аркой до ключевого выбора — более осознанный темп, чем табличный порядок акта.
**Supports:** user-spec «Как должно работать» шаг 3, «Технические решения» п.4.

### Decision 5: Коты — один `PropDef` с визуалом на две фигурки

**Rationale:** спецификация акта прямо называет их одним связанным предметом.
**Supports:** user-spec «Технические решения» п.5.

### Decision 6: Ассеты — через `import.meta.env.BASE_URL`

**Rationale:** `vite.config.ts` задаёт непустой `base` для GitHub Pages; абсолютные пути в `this.load.image(...)` не переписываются Vite и 404-ят только на Pages (`code-research.md` §6, §13).
**Supports:** user-spec «Технические решения» п.6; AC про сборку без 404.

### Decision 7: Лабиринт Огонька не реализуется

**Supports:** user-spec «Технические решения» п.7, «Ограничения».

### Decision 8: Без комикс-воспоминания/оверлеев/пасхалок

**Supports:** user-spec «Технические решения» п.8, «Ограничения».

### Decision 9: Плейсхолдеры — Phaser Graphics/Container, не файлы-картинки

**Rationale:** убирает риск 404 на GitHub Pages сразу для 8+ предметов; единственные файловые ассеты — два спрайта персонажей.
**Supports:** user-spec «Технические решения» п.9, «Ограничения», Risk (абсолютные пути ассетов).

### Decision 10: Landscape-only с DOM-заглушкой вместо камеры/скролла

**Supports:** user-spec «Как должно работать» шаг 2, «Технические решения» п.10.

### Decision 11: Звук — осцилляторы поверх `AudioContext`, без аудиофайлов

**Supports:** user-spec «Ограничения» (звук), «Технические решения» п.11.

### Decision 12: Без эскейп-кнопки «всё равно играть» в заглушке

**Supports:** user-spec «Технические решения» п.12, «Ограничения» (заблокированный автоповорот — не поддерживается).

### Decision 13: Семантика сигнала скрытой точки (дискавери, не случайность)

**Rationale:** примиряет `placement-mechanics.md` §12.5 (осознанное обнаружение) с допуском случайного зачёта из интервью — оба исхода проходят через один и тот же сигнал.
**Supports:** user-spec «Технические решения» п.13/п.15, AC про сигнал скрытой точки.

### Decision 14: Сохранение — только запись (`saveAct1Result`), без `loadSave`

**Supports:** user-spec «Технические решения» п.14, «Ограничения» (сохранение).

---

### Decision 15: Минимальный поддерживаемый вьюпорт = 600×360 CSS px [TECHNICAL]

**Decision:** принимается ровно нижняя граница, заданная user-spec, без запаса.
**Rationale:** user-spec явно делегирует точное число tech-spec'у, устанавливая только пол («не менее этой величины»); нет технической причины поднимать порог выше.
**Alternatives considered:** больший запас (например 640×400) — отклонено, не даёт игровой ценности и сужает поддерживаемые устройства без причины.
**Supports:** user-spec AC «минимальный поддерживаемый вьюпорт (~600×360 CSS px)».

### Decision 16: Минимальный интерактивный хитбокс = 100×100 design px [TECHNICAL]

**Decision:** каждый перетаскиваемый предмет и каждая точка-маркер имеют хитбокс не меньше 100×100 в design-space 1280×720.
**Rationale:** при `Scale.FIT`, `min(vw/1280, vh/720)` на границе 600×360 масштаб = `min(600/1280, 360/720)` = 0.46875; чтобы получить ≥44 CSS px эффективной зоны захвата, нужно `44 / 0.46875 ≈ 93.9` design px — округлено вверх до 100 с запасом.
**Alternatives considered:** ровно 94px — отклонено, не оставляет запаса на погрешности рендера/hit-area.
**Supports:** user-spec AC «не менее ~44-48 CSS px эффективной зоны захвата».

### Decision 17: Радиус магнита (snapRadius) = 70 design px [TECHNICAL]

**Rationale:** больше половины хитбокса (Decision 16), даёт заметное «подтягивание» до того, как курсор/палец геометрически попал точно в точку — соответствует описанию «мягкое магнитное притяжение» без произвольного выбора числа с потолка.
**Supports:** user-spec «Как должно работать» шаг 4.

### Decision 18: Тайминги сигнала скрытой точки — 400ms сигнал / 700ms магнит [TECHNICAL]

**Decision:** тактильный сигнал (дрожание/лепестки/реакция Огонька) — при 400ms удержания рядом со скрытой точкой; магнитное притяжение к ней — при 700ms.
**Rationale:** сигнал обязан срабатывать раньше и не мгновенно при простом пролёте мимо (AC); зазор в 300ms даёт ощутимый «сначала намёк, потом захват» без затягивания взаимодействия.
**Supports:** user-spec AC «скрытая точка… даёт собственный сигнал… отличимый от… удержания для магнита».

### Decision 19: Тайминги доводки/возврата — 150ms / 300ms [TECHNICAL]

**Decision:** доводка предмета к точке — 150ms; возврат котов в ящик — 300ms (середины диапазонов 120-180ms и 250-350ms из user-spec «Ограничения»).
**Supports:** user-spec «Ограничения» (переходные фазы).

### Decision 20: Автоподсказка = 12000ms, частичная подсказка кнопки = 1300ms [TECHNICAL]

**Rationale:** середины/канонические значения диапазонов 10-15с и 1-1.5с; 12000ms уже зафиксировано как каноничное в `docs/act-01-lilac-garden.md` §7 (обнаружено в исходном code-research).
**Supports:** user-spec AC про автоподсказку и кнопку подсказки.

### Decision 21: Ориентация — `matchMedia`, не `Phaser.Scale.ScaleManager` [TECHNICAL]

**Decision:** источник истины — `window.matchMedia('(orientation: portrait)')` + DOM-оверлей в `index.html`, а не `this.scale.isPortrait`/`ORIENTATION_CHANGE`.
**Rationale:** критерий user-spec — это соотношение ширины/высоты вьюпорта (совпадает с семантикой CSS media feature `orientation`), а `ScaleManager.isPortrait` отражает Orientation Sensor API, которое «обычно доступно только на мобильных устройствах» (типы Phaser 3.90, `code-research.md` §11) — не среагирует на ручной ресайз десктопного окна браузера, что ломает ручную проверку на десктопе, требуемую в «Как проверить». `matchMedia` также работает независимо от жизненного цикла Phaser (может показать оверлей ещё до старта игры).
**Alternatives considered:** `Phaser.Scale.Events.ORIENTATION_CHANGE`/`isPortrait` — отклонено по причине выше; `isGamePortrait`/`isGameLandscape` — отклонено, они всегда `landscape` для нашего фиксированного design-space 1280×720 (отвечают на другой вопрос).
**Supports:** user-spec «Как должно работать» шаг 2, AC про заглушку «поверни телефон».

### Decision 22: `disableInteractive()` для размещённых обычных предметов; статичное окружение никогда не становится интерактивным [TECHNICAL]

**Decision:** после установки обычный (не ключевой) предмет получает `disableInteractive()`, а не `removeInteractive()` и не остаётся навсегда без `setInteractive()`. Статичное окружение (лавочка/качеля/самокат) вообще никогда не вызывает `setInteractive()`.
**Rationale:** `disableInteractive()` синхронный, обратимый дешёвым `setInteractive()` без аргументов — оставляет технический путь для будущего расширения (`placement-mechanics.md` §3, «предметы остаются доступными для выбора»), сознательно суженного только в этом срезе, без дополнительной стоимости сейчас. `removeInteractive()` уничтожает `InteractiveObject` и откладывает удаление на «следующий игровой шаг» — не нужная сложность для одноразового среза. Окружение никогда не интерактивно по дизайну — не нужно даже создавать `InteractiveObject` (`code-research.md` §10).
**Supports:** user-spec AC «попытка перетащить уже зафиксированный предмет ни к чему не приводит», «Ограничения» (только куст переносится).

### Decision 23: Подготовка спрайтов — one-off Node-скрипт на `sharp` (devDependency) [TECHNICAL]

**Decision:** `scripts/prepare-sprites.mjs`, использующий `sharp` для обрезки и luminance-based альфа-маскирования (не colour-key); запускается один раз агентом, результат коммитится в `public/assets/`.
**Rationale:** ImageMagick не гарантированно установлен на машине разработки; Python/Pillow не имеет прецедента в этом Node/Vite проекте; `sharp` — стандартный выбор для программной обработки изображений в Node, ставится как devDependency (не нужен в рантайме игры и не должен попасть в бандл).
**Alternatives considered:** ручная обработка в графическом редакторе — отклонено, не воспроизводимо и не автоматизируемо агентом.
**Supports:** user-spec «Ограничения» (спрайты — реальный арт, обрезанный из модельных листов), Risk (альфа-канал/ореол).

### Decision 24: Ключ localStorage `teddy-save`, форма save-блоба [TECHNICAL]

**Decision:** `{ version: number, acts: { act1?: { completed: boolean, scheme: 'main' | 'hidden' } } }`.
**Rationale:** версионированный блоб с самого начала, как требует `architecture.md` → Data Model; форма расширяема будущими актами без миграции существующих ключей.
**Supports:** user-spec AC «localStorage содержит корректную запись».

### Decision 25: Новая папка `src/logic/` для чистой игровой логики [TECHNICAL]

**Rationale:** `architecture.md` пока не документирует такую папку; добавляется, потому что правила игры должны быть юнит-тестируемы без поднятого Phaser (Decision 3) — существующие `src/objects`/`src/config` для этого не подходят по смыслу (объекты — Phaser GameObjects, config — данные, не функции).
**Supports:** Decision 3.

### Decision 26: Новые папки `src/audio/` и `src/ui/` [TECHNICAL]

**Decision:** `src/audio/sfx.ts` — обёртка над `AudioContext`; `src/ui/orientationGuard.ts` — DOM-логика вне Phaser Scene (оверлей — не GameObject).
**Rationale:** обе концерны не вписываются в существующие папки (`objects`, `scenes`, `comics`, `save`, `config`, `types`) по их документированному назначению.
**Supports:** Decision 21, звуковые decisions выше.

### Decision 27: Числовой контракт реакций окружения [TECHNICAL]

**Decision:** основная постановка — качеля: покачивание ±2°, один цикл ~600ms; самокат не реагирует. Скрытая постановка — качеля: ±6°, один цикл ~700ms; самокат: фара горит 1000ms + звук «пик-пик» (`sfx.playScooterBeep`) + смещение на 70 design px к ножке лавочки за 400ms ease-out.
**Rationale:** переводит качественное описание `act-01-storyboard-playground.md` §8/§8C («едва заметное», «чуть сильнее», «10–15 сантиметров») в фиксированные проверяемые числа; 70px — читаемый на дизайн-холсте 1280×720 сдвиг, дающий тот же комический эффект без привязки к нереальному «сантиметру» в 2D-сцене.
**Supports:** user-spec AC «Постоянное окружение… реагирует по выбранной постановке».

## Data Models

```ts
// src/types/placement.ts
type SchemeId = 'main' | 'hidden';
type PropRole = 'common' | 'key' | 'dependent';

type PropVisual =
  | {
      kind: 'placeholder';
      shape: 'rect' | 'ellipse';
      width: number;
      height: number;
      fill: number;
      label: string;
    }
  | { kind: 'sprite'; texture: string; scale?: number };

interface DropPoint {
  id: string;
  x: number;
  y: number;
  scheme: SchemeId | 'both';
  snapRadius: number; // Decision 17: 70
  isHidden?: boolean; // Decision 18 dwell/magnet timings apply only when true
}

interface PropDef {
  id: string;
  order: number;
  visual: PropVisual;
  role: PropRole;
  required: boolean;
  points: DropPoint[];
  hitboxSize?: { width: number; height: number }; // Decision 16 default: 100x100
  holdToDragMs?: number; // Decision 2: 500, gated by catsPlaced
}

interface EnvironmentReaction {
  swingRotationDeg: number;
  swingCycleMs: number;
  scooter?: { headlightMs: number; shiftPx: number; shiftMs: number };
}

interface EnvironmentDef {
  id: string;
  visual: PropVisual;
  reactions: Record<SchemeId, EnvironmentReaction>; // Decision 27
}

interface OutcomeDef {
  scheme: SchemeId;
  title: string;
  durationMs: number;
  beats: { atMs: number; description: string }[];
}

interface ActConfig {
  id: 'act1';
  keyPropId: string;
  dependentPropIds: string[];
  props: PropDef[];
  environment: EnvironmentDef[];
  outcomes: Record<SchemeId, OutcomeDef>;
  autoHintDelayMs: number; // Decision 20: 12000
  hintButtonRevealMs: number; // Decision 20: 1300
  hiddenSignalDelayMs: number; // Decision 18: 400
  hiddenMagnetDelayMs: number; // Decision 18: 700
}
```

```ts
// src/save/index.ts
interface SaveData {
  version: number;
  acts: {
    act1?: { completed: boolean; scheme: SchemeId };
  };
}
// key: 'teddy-save' (Decision 24)
```

## Dependencies

### New packages

- `sharp` (devDependency) — обрезка и альфа-маскирование спрайтов персонажей, только для one-off скрипта `scripts/prepare-sprites.mjs`; не используется в рантайме игры (Decision 23).

### Using existing (from project)

- `phaser` — `Scene`, `Input` (drag events, `setInteractive`/`disableInteractive`), `Sound.WebAudioSoundManager` (`AudioContext`), `GameObjects.Graphics`/`Container` (плейсхолдеры), `Types.Core.GameConfig.scene`.
- `vite` — `import.meta.env.BASE_URL` (Decision 6), `npm run preview` для проверки base path.
- `vitest`/`jsdom`/`vitest-canvas-mock` — юнит-тесты `src/logic/placement.ts` и `src/save/index.ts`.

## Testing Strategy

**Feature size:** L

### Unit tests

- `resolveScheme`: возвращает `null` до установки куста, `'main'`/`'hidden'` в зависимости от точки установки куста.
- `activePointsFor`: фильтрует точки по `scheme === 'both' || scheme === activeScheme`; до выбора схемы возвращает только `'both'`-точки.
- `findSnapTarget`: выбирает ближайшую точку в радиусе; не «дёргается» на границе радиуса (гистерезис/детерминированный выбор при равном расстоянии); скрытые точки другой активной схемы не притягивают.
- `hiddenPointDwellState(elapsedMs, signalDelayMs, magnetDelayMs)`: `'none'` до 400ms, `'signal'` в [400, 700), `'magnet'` от 700ms.
- `isSceneReady`: `false`, пока не установлен хоть один обязательный предмет; `true`, когда все обязательные предметы (включая котов, зависящих от схемы) на местах.
- `nextHintTarget`: никогда не указывает на `isHidden`-точку; возвращает `null`, если ставить нечего.
- `saveAct1Result`: пишет корректный `SaveData` под ключом `teddy-save`; не бросает исключение при недоступном `localStorage` (try/catch, мок `localStorage.setItem` кидает `DOMException`).
- `defaultSave`: возвращает `version: SAVE_FORMAT_VERSION`, пустой `acts`.
- Обновлённый `tests/unit/gameConfig.test.ts`: `gameConfig.scene` длиной 3.

### Integration tests

None — в проекте нет интеграционной инфраструктуры (`patterns.md`); создавать её ради одной фичи избыточно (согласовано в user-spec «Тестирование»).

### E2E tests

None — нет E2E-фреймворка; визуальную/тактильную корректность драг-механики агент оценить не может (`patterns.md` → Agent Verification Methods) — это закрывает ручная проверка (см. Agent Verification Plan).

## Agent Verification Plan

**Source:** user-spec.md → «Как проверить».

### Verification approach

Автоматически: `npm test` (юнит-тесты логики/save), `npm run lint`, `npm run build` (`tsc --noEmit && vite build`), `npm run build && npm run preview` — обязательно вместо `npm run dev`, чтобы поймать 404 на base path (`code-research.md` §6, §13).

Механически проверяемое агентом сверх тестов (не «ощущение», а факт): открыть собранный `preview` в браузере и убедиться, что нет ошибок в консоли и нет 404 в сетевых запросах при загрузке обоих спрайтов; при наличии Chrome-автоматизации — изменить размер окна через границу 600×360 и убедиться, что DOM-оверлей появляется/исчезает (перед использованием браузерных инструментов — спросить подтверждение в чате, как договорено ранее).

Всё, что требует суждения о «фиче» (магнит без дребезга на ощупь, читаемость плейсхолдеров ребёнком, понятность сигнала скрытой точки, синхронность звука/анимации, вовлечённость) — вне досягаемости агента и остаётся ручной проверкой пользователя, как прямо указано в user-spec «Как проверить» → «Агент проверяет» / «Пользователь проверяет».

### Tools required

`bash`/`npm` (test/build/lint/preview). MCP-инструменты не требуются для этого среза (нет E2E-фреймворка). Chrome-автоматизация (`claude-in-chrome`) может использоваться опционально для механических DOM/консоль-проверок — не заменяет обязательный ручной плейтест.

## Risks

| Risk                                                                                                                            | Mitigation                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Альфа-канал при вырезании спрайтов (текстурная бумага + мягкое свечение Огонька) оставит halo на тёмной сцене                   | Отдельная задача (Task 3) на luminance-масштабирование вместо colour-key + ручная проверка края свечения                                                                                              |
| Абсолютные пути ассетов ломаются на GitHub Pages, не локально (`base: '/teddy-and-the-magic-theatre/'`)                         | Загрузка через `import.meta.env.BASE_URL` (Decision 6); обязательная ручная проверка через `npm run build && npm run preview`                                                                         |
| `tests/unit/gameConfig.test.ts` сломается при регистрации новой сцены                                                           | Обновление теста — явная часть Task 6, не отдельная находка в CI                                                                                                                                      |
| `sharp` — нативные бинарники, доступность на машине агента не гарантирована                                                     | Скрипт запускается один раз локально агентом, не входит в CI/build pipeline; в CI используются только закоммиченные PNG-результаты, `sharp` не требуется на этапе `npm ci`/`npm test`/`npm run build` |
| Плейсхолдеры недостаточно понятны ребёнку без чёткой подписи/цвета                                                              | Обязательный label + заливка по палитре акта для каждого плейсхолдера (Task 1 config)                                                                                                                 |
| `matchMedia`/`disableInteractive`/`sound.context` — впервые применяются в этом проекте, нет прецедента для копирования паттерна | Все три подхода задокументированы и проверены против реальных типов Phaser 3.90 (`code-research.md` §10–12) перед реализацией, не из памяти                                                           |
| Финальная ручная проверка — на машине разработчика, не на устройстве ребёнка                                                    | Осознанный остаточный риск, компенсируется финальным ручным плейтест-гейтом с живым ребёнком после деплоя (см. user-spec «Пользователь проверяет»)                                                    |

## User-Spec Deviations

None. Все числовые константы и структурные решения этого документа (Decisions 15–27) заполняют то, что user-spec явно делегировал tech-spec'у («точный design-space размер фиксируется в tech-spec», «ниже этого порога — решение tech-spec», «точное смещение в design-space px — решение tech-spec») — это не отклонения, а выполнение прямого указания.

## Acceptance Criteria

Технические критерии приёмки (дополняют пользовательские из user-spec):

- [ ] `npm run build && npm run preview` не даёт 404 ни на одном ассете (включая оба спрайта персонажей) с учётом base path GitHub Pages.
- [ ] `tsc --noEmit` (часть `npm run build`) проходит в strict-режиме для всех новых модулей (`src/logic`, `src/audio`, `src/ui`, `src/scenes/Act1LilacGarden.ts`, `src/types/placement.ts`, `src/config/act1.ts`).
- [ ] `npm run lint` проходит без ошибок `@typescript-eslint/no-explicit-any` и `@typescript-eslint/no-unused-vars` в новом коде.
- [ ] `npm test` проходит зелёным, включая `tests/unit/placement.test.ts`, `tests/unit/save.test.ts` и обновлённый `tests/unit/gameConfig.test.ts` (3 сцены).
- [ ] Ни один тест не поднимает `Phaser.Game`/жизненный цикл Scene — только `src/logic/placement.ts` и `src/save/index.ts` импортируются в тестах.
- [ ] `sharp` присутствует только в `devDependencies`, не влияет на размер продакшен-бандла.

## Implementation Tasks

### Wave 1 (независимые)

#### Task 1: Domain model, Act I config & placement logic

- **Description:** Определить типы (`src/types/placement.ts`) и data-driven конфиг Акта I (`src/config/act1.ts`: 8 предметов в порядке раскадровки, статичное окружение, обе постановки) плюс Phaser-свободную логику (`resolveScheme`, `activePointsFor`, `findSnapTarget`, `isSceneReady`, `nextHintTarget`, `hiddenPointDwellState`) с юнит-тестами. Никакого Phaser Scene кода — это тестируемое ядро.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Verify-smoke:** `npm test -- placement` → все новые тесты зелёные
- **Files to modify:** `src/types/placement.ts`, `src/config/act1.ts`, `src/logic/placement.ts`, `tests/unit/placement.test.ts`
- **Files to read:** `work/act-1-vertical-slice/code-research.md` (§1–2), `docs/act-01-lilac-garden.md`, `docs/act-01-storyboard-playground.md`, `docs/placement-mechanics.md`

#### Task 2: Save module extension

- **Description:** Расширить `src/save/index.ts`: `SaveData`, `defaultSave()`, `saveAct1Result(scheme)` — версионированный localStorage-блоб под ключом `teddy-save`, try/catch на недоступный/заблокированный localStorage. `loadSave` не реализуется в этом срезе.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Verify-smoke:** `npm test -- save`
- **Files to modify:** `src/save/index.ts`, `tests/unit/save.test.ts`
- **Files to read:** `.claude/skills/project-knowledge/references/architecture.md`, `work/act-1-vertical-slice/user-spec.md` («Технические решения»)

#### Task 3: Character sprite prep

- **Description:** One-off Node-скрипт (`scripts/prepare-sprites.mjs`, `sharp`), обрезающий Мишку и Огонька из локальных модельных листов `artbook/` и удаляющий бумажный фон через luminance-based альфа-маскирование (не colour-key). Результат коммитится в `public/assets/`.
- **Skill:** code-writing
- **Reviewers:** code-reviewer
- **Verify-smoke:** `node scripts/prepare-sprites.mjs` завершается без ошибок; `public/assets/teddy.png`/`ogonek.png` существуют с ожидаемыми размерами и не полностью непрозрачным краем
- **Verify-user:** визуально подтвердить отсутствие ореола вокруг свечения Огонька на тёмном фоне сцены
- **Files to modify:** `scripts/prepare-sprites.mjs`, `package.json` (devDependency `sharp`), `public/assets/teddy.png`, `public/assets/ogonek.png`
- **Files to read:** `artbook/character-art-teddy.png`, `artbook/character-art-ogonek.png` (локально, не в git), `work/act-1-vertical-slice/code-research.md` (§3)

#### Task 4: Orientation guard module

- **Description:** Модуль `src/ui/orientationGuard.ts` на `matchMedia('(orientation: portrait)')` + DOM-оверлей «поверни телефон» в `index.html`, с колбэком для подписки, которым позже воспользуется сцена (гейтинг ввода, отмена незавершённого драга).
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Verify-user:** изменить размер окна браузера через границу portrait/landscape (`run` скилл) и убедиться, что оверлей появляется/исчезает
- **Files to modify:** `src/ui/orientationGuard.ts`, `index.html`
- **Files to read:** `work/act-1-vertical-slice/code-research.md` (§11, §8)

#### Task 5: Audio/SFX module

- **Description:** Модуль `src/audio/sfx.ts` с осцилляторными звуками (`playSnap`, `playHintChime`, `playScooterBeep`) поверх `(scene.sound as Phaser.Sound.WebAudioSoundManager).context`, без аудиофайлов и без `this.load.audio`.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Verify-user:** вручную вызвать каждый звук в браузере и подтвердить, что он слышен
- **Files to modify:** `src/audio/sfx.ts`
- **Files to read:** `work/act-1-vertical-slice/code-research.md` (§12)

### Wave 2 (зависит от Wave 1)

#### Task 6: Scene wiring, asset loading & prop dispensing

- **Description:** Зарегистрировать `Act1LilacGarden` в `gameConfig.scene`, загрузить оба спрайта в `Preload` через `BASE_URL`, добавить переход `Preload → Act1LilacGarden`, обновить `tests/unit/gameConfig.test.ts` до 3 сцен. Сцена рисует статичное окружение и выдаёт предметы из ящика по одному в порядке конфига, с плейсхолдер-метками на каждой активной точке.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Verify-smoke:** `npm test -- gameConfig`; `npm run build && npm run preview` без 404 в сетевых запросах
- **Verify-user:** открыть собранный preview, убедиться, что сцена стартует сразу на Сиреневом саде с первым предметом в ящике
- **Files to modify:** `src/config/gameConfig.ts`, `src/scenes/Preload.ts`, `src/scenes/Act1LilacGarden.ts`, `tests/unit/gameConfig.test.ts`
- **Files to read:** `src/types/placement.ts`, `src/config/act1.ts`, `public/assets/teddy.png`, `public/assets/ogonek.png`, `work/act-1-vertical-slice/code-research.md` (§9, §13)

### Wave 3 (зависит от Wave 2)

#### Task 7: Drag & snap core interaction

- **Description:** `dragstart`/`drag`/`dragend` на каждом обычном предмете через `findSnapTarget`/`activePointsFor` из Task 1: магнит без дребезга у границы радиуса, доводка+сжатие+крошки+`sfx.playSnap()`, возврат в ящик при промахе, `disableInteractive()` после установки.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Verify-user:** перетащить каждый обычный предмет в браузере, убедиться в отсутствии мерцания у границы радиуса и в соответствии таймингов доводки/промаха
- **Files to modify:** `src/scenes/Act1LilacGarden.ts`
- **Files to read:** `src/logic/placement.ts`, `src/audio/sfx.ts`, `work/act-1-vertical-slice/code-research.md` (§1, §10)

### Wave 4 (зависит от Wave 3)

#### Task 8: Key prop special behavior (высокий куст)

- **Description:** Hold-to-drag (500ms, `time.delayedCall` + переключение `setDraggable`), активный только когда коты уже установлены; сигнал скрытой точки (400ms) отдельно от порога магнита (700ms); перенос куста после установки котов возвращает котов в ящик и сбрасывает `activeScheme`.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Verify-user:** короткий тап ничего не делает, удержание+драг переносит куст, скрытая точка даёт свой тактильный сигнал до магнита, повторный перенос после котов отправляет их в ящик
- **Files to modify:** `src/scenes/Act1LilacGarden.ts`
- **Files to read:** `src/logic/placement.ts`, `work/act-1-vertical-slice/user-spec.md` (шаг 5)

### Wave 5 (зависит от Wave 4)

#### Task 9: Idle auto-hint & hint button

- **Description:** Таймер автоподсказки 12с (сброс при установке, пауза пока предмет в руках), летящий Огонёк только к основной точке; постоянная кнопка подсказки (подпрыгивание + частичная подсказка 1.3с), неактивна во время драга или когда ставить нечего.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Verify-user:** оставить предмет неустановленным дольше 12с и убедиться в единичной автоподсказке; нажать кнопку подсказки в каждом «неактивном» состоянии и убедиться, что она не срабатывает
- **Files to modify:** `src/scenes/Act1LilacGarden.ts`
- **Files to read:** `src/logic/placement.ts`, `src/audio/sfx.ts`

### Wave 6 (зависит от Wave 5)

#### Task 10: Console, outcome playback & environment reactions

- **Description:** Пульт загорается при `isSceneReady`; клик проигрывает плейсхолдер-постановку выбранной схемы (все биты читаются без звука, ввод заблокирован) и синхронную реакцию окружения по числовому контракту (Decision 27).
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Verify-user:** пройти обе постановки целиком, убедиться, что их нельзя прервать вводом и что они читаются с выключенным звуком
- **Files to modify:** `src/scenes/Act1LilacGarden.ts`
- **Files to read:** `src/config/act1.ts`, `src/audio/sfx.ts`, `docs/act-01-storyboard-playground.md` (§8, §8C)

### Wave 7 (зависит от Wave 6)

#### Task 11: Continue/reposition flow & orientation guard integration

- **Description:** Экраны «продолжить» (`saveAct1Result` + текстовая заглушка) и «переставить» (сброс только куста+котов, повтор без повторного показа подсказок, зачёт той же схемы при той же точке); подключить `orientationGuard` из Task 4 к жизненному циклу сцены (отмена драга и блокировка ввода при флипе в портрет); подтвердить, что перезагрузка страницы всегда стартует с чистого листа.
- **Skill:** code-writing
- **Reviewers:** code-reviewer, security-auditor, test-reviewer
- **Verify-user:** полный ручной проход цикла «переставить» (включая повтор в ту же скрытую точку) и флип ориентации посреди драга
- **Files to modify:** `src/scenes/Act1LilacGarden.ts`, `src/main.ts`
- **Files to read:** `src/save/index.ts`, `src/ui/orientationGuard.ts`, `work/act-1-vertical-slice/user-spec.md` (шаги 10–11)

### Audit Wave

#### Task 12: Code Audit

- **Description:** Full-feature code quality audit. Прочитать все исходники, созданные/изменённые в этой фиче (см. decisions.md + «Files to modify» выше). Проверить целостно: дублирование инициализации ресурсов, соответствие Shared Resources, архитектурную согласованность. Отчёт.
- **Skill:** code-reviewing
- **Reviewers:** none

#### Task 13: Security Audit

- **Description:** Full-feature security audit. Прочитать все исходники фичи. OWASP Top 10 по всем компонентам (в первую очередь — обращения к `localStorage`, обработка ошибок доступа). Отчёт.
- **Skill:** security-auditor
- **Reviewers:** none

#### Task 14: Test Audit

- **Description:** Full-feature test quality audit. Прочитать все тестовые файлы фичи. Проверить покрытие, осмысленность ассертов, баланс пирамиды тестов (здесь — почти целиком unit). Отчёт.
- **Skill:** test-master
- **Reviewers:** none

### Final Wave

#### Task 15: Pre-deploy QA

- **Description:** Приёмочное тестирование: прогнать все тесты, проверить критерии приёмки из user-spec и tech-spec (включая `npm run build && npm run preview` на 404 и ручной сценарий из Agent Verification Plan).
- **Skill:** pre-deploy-qa
- **Reviewers:** none

Деплой не включён в этот план: `main` — защищённая ветка, слияние `dev → main` требует отдельного явного согласования с пользователем (user-spec «Ограничения»), не выполняется автоматически по завершении задач.
