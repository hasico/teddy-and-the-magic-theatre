# Teddy and the Magic Theatre

> **Это README для владельца проекта**, а не для AI-агентов.
> Инструкции для агентов находятся в CLAUDE.md и .claude/skills/project-knowledge/references/

## О проекте

Короткая сюжетная браузерная 2D-игра для детей 8–10 лет. Маленький вязаный мишка потерял свою хозяйку Ангелину и, чтобы найти дорогу домой, проходит три ожившие театральные постановки — расставляет декорации, наблюдает забавные последствия своих решений и постепенно вспоминает свою историю. Полный игровой паспорт — в `docs/game-passport.md`.

## Технологии

Phaser 3 + TypeScript, сборка на Vite. Без бэкенда — прогресс хранится в `localStorage` браузера. Хостинг — GitHub Pages, автодеплой из GitHub Actions при пуше в `main`. Подробности — в `.claude/skills/project-knowledge/references/architecture.md` и `deployment.md`.

## Быстрый старт

Требуется Node.js 24+.

```bash
npm install       # установить зависимости
npm run dev       # dev-сервер (http://localhost:8080)
npm run build     # прод-сборка в dist/
npm test          # юнит-тесты (Vitest)
npm run lint      # проверка кода (ESLint)
```

Перед коммитом автоматически запускаются gitleaks (сканирование секретов), ESLint и Prettier — см. `.husky/pre-commit`.

## Структура проекта

```
.claude/                    # База знаний для AI-агентов
└── skills/
    └── project-knowledge/  # Project docs (architecture, patterns, etc.)

docs/                        # Гейм-дизайн доки (game-passport.md — источник истины по сюжету)
src/
├── scenes/                  # Phaser-сцены (Boot, Preload, Prologue, Act1-3, Finale)
├── objects/                 # Переиспользуемые игровые объекты (Мишка, Огонёк, декорации)
├── comics/                  # Система комикс-оверлеев
├── save/                    # Сохранение/загрузка прогресса (localStorage)
├── config/                  # Конфиг Phaser, константы
└── types/                   # TS-типы
public/assets/                # Арт, аудио, комикс-ассеты
tests/                        # Vitest юнит-тесты
work/completed/                # Архив завершённых фич
```

## Методология разработки

Проект использует **spec-driven подход** с AI-агентами:

1. **User Spec** (русский) → описываем ЧТО и ЗАЧЕМ нужно
2. **Tech Spec** (английский) → описываем КАК реализовать
3. **Tasks** → декомпозиция на задачи
4. **Implementation** → AI-агент делает код

Активные и завершённые фичи ведутся в папке `work/`.
