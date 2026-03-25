import * as Phaser from 'phaser';
import { SPIN_TAROT_SPRITE_CONFIG } from './spinTarotConfig.js';

const BOARD_SCENE_KEY = 'spin-tarot-board-scene';
const BOARD_TEXTURE_KEY = 'spin-tarot-sheet-frames';
const BOARD_REELS = 5;
const BOARD_ROWS = 1;
const CARD_RATIO = SPIN_TAROT_SPRITE_CONFIG.tileHeight / SPIN_TAROT_SPRITE_CONFIG.tileWidth;
const CARD_COLORS = {
    Wand: 0xf6ad55,
    Sword: 0xf87171,
    Cup: 0x67e8f9,
    Pentacle: 0xa3e635,
    arcana: 0xfcd34d,
    blank: 0x64748b,
    held: 0x60a5fa,
    hit: 0xfbbf24,
    flash: 0xfef08a
};

class SpinTarotBoardScene extends Phaser.Scene {
    constructor() {
        super({ key: BOARD_SCENE_KEY });
        this.boardView = null;
        this.cardNodes = [];
        this.cardWidth = 0;
        this.cardHeight = 0;
        this.spinTween = null;
        this.stopTweens = [];
        this.lineSweepTween = null;
        this.lineSweepState = null;
        this.lineOverlay = null;
        this.lineGlowOverlay = null;
        this.modeBadgeBg = null;
        this.modeBadgeText = null;
        this.stageHintText = null;
        this.resultBadgeBg = null;
        this.resultBadgeText = null;
        this.resultFloatText = null;
        this.resultPulseTween = null;
        this.currentlySpinning = false;
        this.lastLineSweepKey = '';
        this.lastResultPulseKey = '';
        this.onReady = null;
    }

    preload() {
        if (!this.textures.exists(BOARD_TEXTURE_KEY)) {
            this.load.spritesheet(BOARD_TEXTURE_KEY, SPIN_TAROT_SPRITE_CONFIG.src, {
                frameWidth: SPIN_TAROT_SPRITE_CONFIG.tileWidth,
                frameHeight: SPIN_TAROT_SPRITE_CONFIG.tileHeight,
                margin: 0,
                spacing: 0
            });
        }
    }

    create() {
        this.stageShadow = this.add.rectangle(0, 0, 10, 10, 0x000000, 0.24).setOrigin(0.5);
        this.stagePanel = this.add.rectangle(0, 0, 10, 10, 0x0a1120, 1).setOrigin(0.5);
        this.stageGlow = this.add.rectangle(0, 0, 10, 10, 0xf59e0b, 0.08).setOrigin(0.5);
        this.stageFrame = this.add.rectangle(0, 0, 10, 10, 0x000000, 0).setOrigin(0.5);
        this.stageFrame.setStrokeStyle(2, 0x9a6f2b, 0.6);
        this.lineOverlay = this.add.graphics();
        this.lineGlowOverlay = this.add.graphics();
        this.lineOverlay.setDepth(4);
        this.lineGlowOverlay.setDepth(5);
        this.modeBadgeBg = this.add.rectangle(0, 0, 10, 10, 0x111827, 0.92).setOrigin(0, 0).setDepth(6);
        this.modeBadgeText = this.add.text(0, 0, '', {
            fontFamily: '"BIZ UDGothic","MS Gothic",monospace',
            fontStyle: '700',
            color: '#fff3c8'
        }).setOrigin(0, 0).setDepth(7);
        this.stageHintText = this.add.text(0, 0, '', {
            fontFamily: '"BIZ UDGothic","MS Gothic",monospace',
            fontStyle: '700',
            color: '#dbeafe'
        }).setOrigin(1, 0).setDepth(7);
        this.resultBadgeBg = this.add.rectangle(0, 0, 10, 10, 0x111827, 0.8).setOrigin(0.5, 1).setDepth(6);
        this.resultBadgeText = this.add.text(0, 0, '', {
            fontFamily: '"BIZ UDGothic","MS Gothic",monospace',
            fontStyle: '700',
            color: '#fff8cc',
            align: 'center'
        }).setOrigin(0.5, 1).setDepth(7);
        this.resultFloatText = this.add.text(0, 0, '', {
            fontFamily: '"BIZ UDGothic","MS Gothic",monospace',
            fontStyle: '700',
            color: '#fff8cc',
            stroke: '#381407',
            strokeThickness: 6,
            align: 'center'
        }).setOrigin(0.5).setDepth(8);
        this.resultFloatText.setAlpha(0);

        for (let row = 0; row < BOARD_ROWS; row += 1) {
            for (let reel = 0; reel < BOARD_REELS; reel += 1) {
                const shadow = this.add.rectangle(0, 0, 10, 10, 0x000000, 0.18).setOrigin(0.5);
                const base = this.add.rectangle(0, 0, 10, 10, 0x182033, 1).setOrigin(0.5);
                const glow = this.add.rectangle(0, 0, 10, 10, 0xfbbf24, 0).setOrigin(0.5);
                const holdRing = this.add.rectangle(0, 0, 10, 10, 0x000000, 0).setOrigin(0.5);
                const art = this.add.image(0, 0, BOARD_TEXTURE_KEY, SPIN_TAROT_SPRITE_CONFIG.backIndex).setOrigin(0.5);
                const title = this.add.text(0, 0, '', {
                    fontFamily: '"BIZ UDGothic","MS Gothic",monospace',
                    fontStyle: '700',
                    color: '#dce6f6',
                    align: 'center'
                }).setOrigin(0.5, 0);
                const number = this.add.text(0, 0, '', {
                    fontFamily: '"BIZ UDGothic","MS Gothic",monospace',
                    fontStyle: '700',
                    color: '#f8fafc',
                    align: 'left'
                }).setOrigin(0, 1);
                const shimmer = this.add.rectangle(0, 0, 10, 10, 0xffffff, 0).setOrigin(0.5);
                const container = this.add.container(0, 0, [
                    shadow,
                    base,
                    glow,
                    holdRing,
                    art,
                    title,
                    number,
                    shimmer
                ]);
                this.cardNodes.push({
                    row,
                    reel,
                    container,
                    shadow,
                    base,
                    glow,
                    holdRing,
                    art,
                    title,
                    number,
                    shimmer,
                    baseX: 0,
                    baseY: 0,
                    flashTween: null,
                    isFlashing: false
                });
            }
        }

        this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
        this.handleResize(this.scale.gameSize);
        if (this.boardView) this.applyBoardView(this.boardView);
        if (typeof this.onReady === 'function') this.onReady();
    }

    shutdown() {
        this.stopSpinTween();
        this.stopReelStopSequence();
        this.stopLineSweep();
        this.stopResultPulse();
        this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
        this.cardNodes.forEach((node) => {
            if (node.flashTween) node.flashTween.stop();
            node.flashTween = null;
        });
    }

    handleResize(gameSize) {
        const width = Math.max(260, Number(gameSize?.width) || Number(this.scale.width) || 360);
        const height = Math.max(220, Number(gameSize?.height) || Number(this.scale.height) || 320);
        const paddingX = Math.max(18, Math.floor(width * 0.05));
        const paddingY = Math.max(18, Math.floor(height * 0.07));
        const gapX = Math.max(4, Math.floor(width * 0.015));
        const gapY = Math.max(6, Math.floor(height * 0.018));
        const availableWidth = width - (paddingX * 2) - (gapX * (BOARD_REELS - 1));
        const availableHeight = height - (paddingY * 2) - (gapY * (BOARD_ROWS - 1));
        const cardWidth = Math.max(36, Math.floor(Math.min(
            availableWidth / BOARD_REELS,
            availableHeight / BOARD_ROWS / CARD_RATIO
        )));
        const cardHeight = Math.floor(cardWidth * CARD_RATIO);
        const totalWidth = (cardWidth * BOARD_REELS) + (gapX * (BOARD_REELS - 1));
        const totalHeight = (cardHeight * BOARD_ROWS) + (gapY * (BOARD_ROWS - 1));
        const startX = Math.round((width - totalWidth) / 2) + Math.floor(cardWidth / 2);
        const startY = Math.round((height - totalHeight) / 2) + Math.floor(cardHeight / 2);

        this.cardWidth = cardWidth;
        this.cardHeight = cardHeight;

        this.stageShadow.setPosition(width / 2, height / 2 + 8);
        this.stageShadow.setSize(Math.max(80, totalWidth + 28), Math.max(80, totalHeight + 30));
        this.stagePanel.setPosition(width / 2, height / 2);
        this.stagePanel.setSize(Math.max(80, totalWidth + 20), Math.max(80, totalHeight + 20));
        this.stageGlow.setPosition(width / 2, height / 2);
        this.stageGlow.setSize(Math.max(80, totalWidth + 20), Math.max(80, totalHeight + 20));
        this.stageFrame.setPosition(width / 2, height / 2);
        this.stageFrame.setSize(Math.max(80, totalWidth + 18), Math.max(80, totalHeight + 18));
        this.modeBadgeBg.setPosition(16, 16);
        this.modeBadgeText.setPosition(24, 20);
        this.stageHintText.setPosition(width - 18, 22);
        this.resultBadgeBg.setPosition(width / 2, height - 12);
        this.resultBadgeText.setPosition(width / 2, height - 16);
        this.resultFloatText.setPosition(width / 2, height * 0.18);

        this.cardNodes.forEach((node) => {
            const x = startX + (node.reel * (cardWidth + gapX));
            const y = startY + (node.row * (cardHeight + gapY));
            node.baseX = x;
            node.baseY = y;
            node.container.setPosition(x, y);
            node.shadow.setSize(cardWidth, cardHeight);
            node.shadow.setPosition(2, 4);
            node.base.setSize(cardWidth, cardHeight);
            node.glow.setSize(cardWidth + 8, cardHeight + 8);
            node.holdRing.setSize(cardWidth + 6, cardHeight + 6);
            node.shimmer.setSize(cardWidth + 2, cardHeight + 2);
            node.art.setDisplaySize(Math.floor(cardWidth * 0.9), Math.floor(cardHeight * 0.94));
            node.title.setPosition(0, (-cardHeight / 2) + 6);
            node.title.setFontSize(Math.max(7, Math.floor(cardHeight * 0.105)));
            node.setTitleWidth = Math.max(26, cardWidth - 10);
            node.title.setWordWrapWidth(node.setTitleWidth, true);
            node.number.setPosition((-cardWidth / 2) + 6, (cardHeight / 2) - 4);
            node.number.setFontSize(Math.max(14, Math.floor(cardHeight * 0.2)));
        });

        if (this.boardView) this.applyBoardView(this.boardView);
    }

    setBoardView(view) {
        this.boardView = view;
        if (this.sys.isActive()) this.applyBoardView(view);
    }

    applyBoardView(view) {
        if (!view) return;
        const wasSpinning = this.currentlySpinning;
        const isBattle = !!view.isBattle;
        const isHoldPhase = !!view.isHoldPhase;
        const hasWin = !!view.hasWin;
        const isSpinning = !!view.spinning;

        this.stagePanel.setFillStyle(isBattle ? 0x2a1212 : isHoldPhase ? 0x0f1930 : 0x09111f, 1);
        this.stageGlow.setFillStyle(
            hasWin ? 0xf59e0b : isHoldPhase ? 0x38bdf8 : isBattle ? 0xfb7185 : 0xf59e0b,
            hasWin ? 0.14 : isHoldPhase ? 0.08 : isBattle ? 0.09 : 0.05
        );
        this.stageFrame.setStrokeStyle(2, hasWin ? 0xfcd34d : isBattle ? 0xf87171 : isHoldPhase ? 0x60a5fa : 0x9a6f2b, 0.68);
        this.updateStageHud(view);

        this.cardNodes.forEach((node, index) => {
            this.applyCardState(node, view.cards?.[index] || null);
        });
        this.updateWinningLines(view);

        if (isSpinning) {
            this.stopReelStopSequence();
            this.playSpinTween();
        } else if (wasSpinning) {
            this.stopSpinTween();
            this.playReelStopSequence();
        } else {
            this.stopSpinTween();
        }
        this.currentlySpinning = isSpinning;
    }

    applyCardState(node, card) {
        const isBlank = !card || card.kind === 'blank';
        const isHeld = !!card?.heldCore;
        const isHit = !!card?.isHit;
        const isFlash = !!card?.isFlash;
        const accent = card?.kind === 'major'
            ? CARD_COLORS.arcana
            : CARD_COLORS[card?.suit] || CARD_COLORS.blank;
        const frameColor = isFlash ? CARD_COLORS.flash : isHit ? CARD_COLORS.hit : isHeld ? CARD_COLORS.held : accent;
        const frameIndex = Math.max(0, Number(card?.spriteIndex) || SPIN_TAROT_SPRITE_CONFIG.backIndex);
        node.art.setFrame(frameIndex);
        node.base.setFillStyle(isBlank ? 0x101827 : 0x162033, isBlank ? 0.88 : 0.98);
        node.base.setStrokeStyle(2, frameColor, isBlank ? 0.34 : 0.82);
        node.glow.setFillStyle(frameColor, isFlash ? 0.22 : isHit ? 0.16 : isHeld ? 0.12 : 0);
        node.glow.setVisible(isFlash || isHit || isHeld);
        node.holdRing.setStrokeStyle(isHeld ? 2 : 0, CARD_COLORS.held, isHeld ? 0.85 : 0);
        node.title.setText(String(card?.title || ''));
        node.title.setColor(card?.kind === 'major' ? '#fff3c8' : isBlank ? '#94a3b8' : '#dbeafe');
        node.number.setText(String(card?.face || ''));
        node.number.setColor(isFlash ? '#fff8cc' : isHeld ? '#dbeafe' : '#ffffff');
        node.targetAlpha = isBlank ? 0.6 : 1;
        node.targetScale = isFlash ? 1.035 : isHit ? 1.02 : 1;
        node.targetY = node.baseY + (isFlash ? -4 : isHit ? -3 : isHeld ? -2 : 0);
        node.container.setAlpha(node.targetAlpha);
        node.container.setScale(node.targetScale);
        node.container.setPosition(node.baseX, node.targetY);
        node.art.setAlpha(isBlank ? 0.75 : 1);
        node.art.setTint(isBlank ? 0xa3b3c9 : 0xffffff);

        if (isFlash && !node.isFlashing) {
            node.isFlashing = true;
            node.shimmer.setFillStyle(0xffffff, 0.2);
            node.shimmer.setVisible(true);
            if (node.flashTween) node.flashTween.stop();
            node.flashTween = this.tweens.add({
                targets: node.shimmer,
                alpha: { from: 0.22, to: 0 },
                duration: 340,
                ease: 'Quad.easeOut',
                onComplete: () => {
                    node.shimmer.setVisible(false);
                    node.shimmer.alpha = 0;
                }
            });
        } else if (!isFlash) {
            node.isFlashing = false;
            if (node.flashTween) {
                node.flashTween.stop();
                node.flashTween = null;
            }
            node.shimmer.setVisible(false);
            node.shimmer.alpha = 0;
        }
    }

    updateStageHud(view) {
        const tone = getModeTone(view?.modeKey);
        const modeText = `${view?.modeIcon || '🌊'} ${view?.modeLabel || '通常'}`;
        const stageHint = String(view?.stageHint || '');
        const resultText = String(view?.resultText || '');
        this.modeBadgeText.setText(modeText);
        this.modeBadgeText.setColor(tone.text);
        this.modeBadgeText.setFontSize(13);
        const badgeBounds = this.modeBadgeText.getBounds();
        this.modeBadgeBg.setSize(Math.max(86, badgeBounds.width + 18), 28);
        this.modeBadgeBg.setFillStyle(tone.fill, 0.88);
        this.modeBadgeBg.setStrokeStyle(1, tone.stroke, 0.9);
        this.stageHintText.setText(stageHint);
        this.stageHintText.setFontSize(11);
        this.stageHintText.setColor('#dbeafe');
        this.stageHintText.setAlpha(stageHint ? 0.92 : 0);

        this.resultBadgeText.setText(resultText);
        this.resultBadgeText.setFontSize(12);
        this.resultBadgeText.setColor((view?.resultTone === 'danger') ? '#fee2e2' : '#fff8cc');
        const resultBounds = this.resultBadgeText.getBounds();
        this.resultBadgeBg.setSize(Math.max(120, resultBounds.width + 20), resultText ? 26 : 0);
        this.resultBadgeBg.setVisible(!!resultText);
        this.resultBadgeText.setVisible(!!resultText);
        if (resultText) {
            const resultFill = (view?.resultTone === 'danger') ? 0x450a0a : (view?.resultTone === 'treasure') ? 0x052e2b : 0x1f2937;
            const resultStroke = (view?.resultTone === 'danger') ? 0xf87171 : (view?.resultTone === 'treasure') ? 0x34d399 : 0xfbbf24;
            this.resultBadgeBg.setFillStyle(resultFill, 0.82);
            this.resultBadgeBg.setStrokeStyle(1, resultStroke, 0.8);
        }

        const resultPulseKey = String(view?.resultPulseKey || '');
        if (resultPulseKey && resultPulseKey !== this.lastResultPulseKey) {
            this.lastResultPulseKey = resultPulseKey;
            this.playResultPulse(resultText, view?.resultTone);
        } else if (!resultPulseKey) {
            this.lastResultPulseKey = '';
        }
    }

    playResultPulse(text, tone = 'win') {
        if (!text) return;
        this.stopResultPulse();
        const color = tone === 'danger'
            ? '#fecaca'
            : tone === 'treasure'
                ? '#bbf7d0'
                : '#fff8cc';
        this.resultFloatText.setText(text);
        this.resultFloatText.setColor(color);
        this.resultFloatText.setFontSize(28);
        this.resultFloatText.setAlpha(0);
        this.resultFloatText.setScale(0.84);
        this.resultFloatText.setY(this.scale.height * 0.22);
        this.resultPulseTween = this.tweens.add({
            targets: this.resultFloatText,
            alpha: { from: 0, to: 1 },
            scale: { from: 0.84, to: 1.08 },
            y: this.scale.height * 0.17,
            duration: 210,
            ease: 'Back.easeOut',
            yoyo: true,
            hold: 220,
            onComplete: () => {
                this.resultFloatText.setAlpha(0);
                this.resultPulseTween = null;
            }
        });
    }

    stopResultPulse() {
        if (this.resultPulseTween) {
            this.resultPulseTween.stop();
            this.resultPulseTween = null;
        }
        if (this.resultFloatText) {
            this.resultFloatText.setAlpha(0);
        }
    }

    updateWinningLines(view) {
        const lines = Array.isArray(view?.winningLines) ? view.winningLines : [];
        const key = String(view?.lineSweepKey || '');
        if (!lines.length) {
            this.clearWinningLines();
            return;
        }
        this.drawWinningLines(lines, 1);
        if (key && key !== this.lastLineSweepKey) {
            this.lastLineSweepKey = key;
            this.playLineSweep(lines);
        }
    }

    clearWinningLines() {
        this.stopLineSweep();
        this.lastLineSweepKey = '';
        if (this.lineOverlay) this.lineOverlay.clear();
        if (this.lineGlowOverlay) this.lineGlowOverlay.clear();
    }

    stopLineSweep() {
        if (this.lineSweepTween) {
            this.lineSweepTween.stop();
            this.lineSweepTween = null;
        }
        this.lineSweepState = null;
        if (this.lineGlowOverlay) this.lineGlowOverlay.clear();
    }

    playLineSweep(lines) {
        this.stopLineSweep();
        this.lineSweepState = { progress: 0 };
        this.lineSweepTween = this.tweens.add({
            targets: this.lineSweepState,
            progress: 1,
            duration: 540,
            ease: 'Quad.easeOut',
            onUpdate: () => {
                this.drawWinningSweep(lines, this.lineSweepState.progress);
            },
            onComplete: () => {
                this.lineSweepTween = null;
                this.lineSweepState = null;
                this.drawWinningSweep(lines, 1);
            }
        });
    }

    drawWinningLines(lines, alpha = 1) {
        if (!this.lineOverlay) return;
        this.lineOverlay.clear();
        lines.forEach((line) => {
            const points = this.getLinePoints(line);
            if (points.length < 2) return;
            this.lineOverlay.lineStyle(3, 0xfbbf24, 0.24 * alpha);
            this.lineOverlay.beginPath();
            this.lineOverlay.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i += 1) {
                this.lineOverlay.lineTo(points[i].x, points[i].y);
            }
            this.lineOverlay.strokePath();
            points.forEach((point) => {
                this.lineOverlay.fillStyle(0xfff3b0, 0.18 * alpha);
                this.lineOverlay.fillCircle(point.x, point.y, Math.max(5, Math.floor(this.cardWidth * 0.09)));
            });
        });
    }

    drawWinningSweep(lines, progress) {
        if (!this.lineGlowOverlay) return;
        this.lineGlowOverlay.clear();
        const safeProgress = Phaser.Math.Clamp(Number(progress) || 0, 0, 1);
        lines.forEach((line) => {
            const points = this.getLinePoints(line);
            if (points.length < 2) return;
            const marker = this.getLinePointAtProgress(points, safeProgress);
            this.lineGlowOverlay.lineStyle(5, 0xfef08a, 0.18 * (1 - (safeProgress * 0.35)));
            this.lineGlowOverlay.beginPath();
            this.lineGlowOverlay.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i += 1) {
                this.lineGlowOverlay.lineTo(points[i].x, points[i].y);
            }
            this.lineGlowOverlay.strokePath();
            this.lineGlowOverlay.fillStyle(0xfffbeb, 0.9);
            this.lineGlowOverlay.fillCircle(marker.x, marker.y, Math.max(6, Math.floor(this.cardWidth * 0.11)));
            this.lineGlowOverlay.fillStyle(0xfbbf24, 0.48);
            this.lineGlowOverlay.fillCircle(marker.x, marker.y, Math.max(10, Math.floor(this.cardWidth * 0.17)));
        });
    }

    getLinePoints(line) {
        return (line?.coords || [])
            .map((coord) => this.getCardCenter(coord.row, coord.reel))
            .filter(Boolean);
    }

    getCardCenter(row, reel) {
        const node = this.cardNodes.find((entry) => entry.row === Number(row) && entry.reel === Number(reel));
        if (!node) return null;
        return { x: node.baseX, y: node.baseY };
    }

    getLinePointAtProgress(points, progress) {
        if (points.length === 1) return points[0];
        const segments = [];
        let totalLength = 0;
        for (let i = 1; i < points.length; i += 1) {
            const length = Phaser.Math.Distance.Between(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
            segments.push({ from: points[i - 1], to: points[i], length });
            totalLength += length;
        }
        if (totalLength <= 0) return points[0];
        let remaining = totalLength * progress;
        for (const segment of segments) {
            if (remaining <= segment.length) {
                const t = segment.length <= 0 ? 0 : (remaining / segment.length);
                return {
                    x: Phaser.Math.Linear(segment.from.x, segment.to.x, t),
                    y: Phaser.Math.Linear(segment.from.y, segment.to.y, t)
                };
            }
            remaining -= segment.length;
        }
        return points[points.length - 1];
    }

    playSpinTween() {
        if (this.spinTween) return;
        this.spinTween = this.tweens.add({
            targets: this.cardNodes.map((node) => node.container),
            y: '-=4',
            duration: 170,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1,
            hold: 28,
            delay: (_target, index) => {
                const reel = index % BOARD_REELS;
                const row = Math.floor(index / BOARD_REELS);
                return (reel * 28) + (row * 10);
            }
        });
    }

    playReelStopSequence() {
        this.stopReelStopSequence();
        for (let reel = 0; reel < BOARD_REELS; reel += 1) {
            const reelNodes = this.cardNodes.filter((node) => node.reel === reel);
            reelNodes.forEach((node) => {
                node.container.y = Number(node.targetY || node.baseY) - 14;
                node.container.scale = Number(node.targetScale || 1) * 0.94;
                node.container.alpha = Math.max(0.72, Number(node.targetAlpha || 1) - 0.12);
                const tween = this.tweens.add({
                    targets: node.container,
                    y: Number(node.targetY || node.baseY),
                    scale: Number(node.targetScale || 1),
                    alpha: Number(node.targetAlpha || 1),
                    duration: 180,
                    delay: reel * 70,
                    ease: 'Back.easeOut'
                });
                this.stopTweens.push(tween);
            });
        }
    }

    stopReelStopSequence() {
        this.stopTweens.forEach((tween) => tween.stop());
        this.stopTweens = [];
        this.cardNodes.forEach((node) => {
            node.container.y = Number(node.targetY || node.baseY);
            node.container.scale = Number(node.targetScale || 1);
            node.container.alpha = Number(node.targetAlpha || 1);
        });
    }

    stopSpinTween() {
        if (!this.spinTween) return;
        this.spinTween.stop();
        this.spinTween = null;
        this.cardNodes.forEach((node) => {
            node.container.y = Number(node.targetY || node.baseY);
        });
    }
}

function getModeTone(modeKey) {
    if (modeKey === 'boss') return { fill: 0x4c0519, stroke: 0xfb7185, text: '#ffe4e6' };
    if (modeKey === 'battle') return { fill: 0x3b0a0a, stroke: 0xf87171, text: '#fee2e2' };
    if (modeKey === 'treasure') return { fill: 0x052e2b, stroke: 0x34d399, text: '#d1fae5' };
    if (modeKey === 'cz') return { fill: 0x172554, stroke: 0x60a5fa, text: '#dbeafe' };
    if (modeKey === 'high') return { fill: 0x422006, stroke: 0xfbbf24, text: '#fef3c7' };
    if (modeKey === 'hint') return { fill: 0x312e81, stroke: 0xa78bfa, text: '#ede9fe' };
    if (modeKey === 'queen-rush') return { fill: 0x4a044e, stroke: 0xe879f9, text: '#f5d0fe' };
    if (modeKey === 'king-rush') return { fill: 0x3f2f05, stroke: 0xfacc15, text: '#fef9c3' };
    if (modeKey === 'dual-rush') return { fill: 0x3b0764, stroke: 0xf472b6, text: '#fae8ff' };
    if (modeKey === 'gameover') return { fill: 0x111827, stroke: 0x94a3b8, text: '#e2e8f0' };
    return { fill: 0x111827, stroke: 0xf59e0b, text: '#fff3c8' };
}

export function createSpinTarotBoardRenderer(options = {}) {
    let currentContainer = options.container || null;
    let sceneRef = null;
    let lastView = null;
    const onReady = typeof options.onReady === 'function' ? options.onReady : null;

    class RuntimeBoardScene extends SpinTarotBoardScene {
        create() {
            this.onReady = () => {
                sceneRef = this;
                if (lastView) this.setBoardView(lastView);
                if (onReady) onReady();
            };
            super.create();
        }

        shutdown() {
            super.shutdown();
            sceneRef = null;
        }
    }

    const initialWidth = Math.max(260, Number(currentContainer?.clientWidth) || 340);
    const initialHeight = Math.max(220, Number(currentContainer?.clientHeight) || 300);
    const game = new Phaser.Game({
        type: Phaser.CANVAS,
        width: initialWidth,
        height: initialHeight,
        parent: currentContainer || undefined,
        backgroundColor: '#05070d',
        transparent: false,
        pixelArt: true,
        roundPixels: true,
        antialias: false,
        antialiasGL: false,
        autoFocus: false,
        scale: {
            mode: Phaser.Scale.RESIZE,
            autoCenter: Phaser.Scale.CENTER_BOTH,
            width: initialWidth,
            height: initialHeight
        },
        scene: [RuntimeBoardScene]
    });

    const resizeToContainer = () => {
        const width = Math.max(260, Number(currentContainer?.clientWidth) || initialWidth);
        const height = Math.max(220, Number(currentContainer?.clientHeight) || initialHeight);
        game.scale.resize(width, height);
        if (sceneRef) {
            sceneRef.handleResize({ width, height });
        }
    };

    const attach = (nextContainer) => {
        if (!nextContainer) return;
        currentContainer = nextContainer;
        if (game.canvas && game.canvas.parentElement !== nextContainer) {
            nextContainer.innerHTML = '';
            nextContainer.appendChild(game.canvas);
        }
        if (game.canvas?.style) {
            game.canvas.style.width = '100%';
            game.canvas.style.height = '100%';
            game.canvas.style.display = 'block';
            game.canvas.style.imageRendering = 'pixelated';
            game.canvas.style.pointerEvents = 'none';
        }
        resizeToContainer();
    };

    const handleWindowResize = () => {
        resizeToContainer();
    };
    if (typeof window !== 'undefined') {
        window.addEventListener('resize', handleWindowResize);
    }

    return {
        attach,
        update(view) {
            lastView = view;
            if (sceneRef) sceneRef.setBoardView(view);
        },
        resize() {
            resizeToContainer();
        },
        isReady() {
            return !!sceneRef;
        },
        destroy() {
            if (typeof window !== 'undefined') {
                window.removeEventListener('resize', handleWindowResize);
            }
            game.destroy(true);
            currentContainer = null;
            sceneRef = null;
            lastView = null;
        }
    };
}
