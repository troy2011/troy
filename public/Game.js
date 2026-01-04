import * as Phaser from 'phaser';
import WorldMapScene from './WorldMapScene.js';

let gameInstance = null;

export const launchGame = (containerId, playerInfo = null) => {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`[Phaser] Container with id #${containerId} not found.`);
        return null;
    }

    // Ensure the container has valid dimensions
    if (container.clientWidth === 0 || container.clientHeight === 0) {
        console.error(`[Phaser] Container has zero dimensions. Cannot create game.`);
        return null;
    }

    const config = {
        type: Phaser.AUTO, // WebGLが使えるなら使い、だめならCanvasにフォールバック
        width: container.clientWidth,  // コンテナの幅に合わせる
        height: container.clientHeight, // コンテナの高さに合わせる
        parent: containerId, // Phaserを描画するHTML要素のID
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        backgroundColor: '#006994', // 海の色
        input: {
            activePointers: 3, // マルチタッチ対応（ピンチズーム用）
            touch: {
                target: containerId,
                capture: true
            }
        },
        physics: {
            default: 'arcade',
            arcade: {
                gravity: { y: 0 }, // 宇宙や海なので重力はゼロ
                debug: false,
                // 物理エンジンの世界境界をマップサイズに合わせる
                world: {
                    bounds: { x: 0, y: 0, width: 800, height: 800 }
                }
            }
        },
        scene: [WorldMapScene]
    };

    // プレイヤー情報をグローバルに保存して、シーンから参照できるようにする
    if (playerInfo) {
        window.__phaserPlayerInfo = playerInfo;
    }

    gameInstance = new Phaser.Game(config);

    // ウィンドウリサイズイベントに対応
    window.addEventListener('resize', () => {
        if (gameInstance) {
            // コンテナの新しいサイズに合わせてリサイズ
            gameInstance.scale.resize(container.clientWidth, container.clientHeight);
        }
    });

    return gameInstance;
};
