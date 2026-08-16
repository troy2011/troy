const cleanupByModal = new WeakMap();

export function stopModalViewportTracking(modal) {
    const cleanup = modal ? cleanupByModal.get(modal) : null;
    if (!cleanup) return;
    cleanup();
    cleanupByModal.delete(modal);
}

export function startModalViewportTracking(modal, propertyPrefix) {
    stopModalViewportTracking(modal);
    if (!modal || !propertyPrefix || typeof window === 'undefined') return;

    const viewport = window.visualViewport;
    let animationFrameId = 0;
    const sync = () => {
        animationFrameId = 0;
        const width = Math.max(1, Number(viewport?.width) || window.innerWidth || document.documentElement.clientWidth || 1);
        const height = Math.max(1, Number(viewport?.height) || window.innerHeight || document.documentElement.clientHeight || 1);
        const left = Math.max(0, Number(viewport?.offsetLeft) || 0);
        const top = Math.max(0, Number(viewport?.offsetTop) || 0);
        modal.style.setProperty(`--${propertyPrefix}-viewport-left`, `${left}px`);
        modal.style.setProperty(`--${propertyPrefix}-viewport-top`, `${top}px`);
        modal.style.setProperty(`--${propertyPrefix}-viewport-width`, `${width}px`);
        modal.style.setProperty(`--${propertyPrefix}-viewport-height`, `${height}px`);
    };
    const scheduleSync = () => {
        if (animationFrameId) return;
        animationFrameId = window.requestAnimationFrame(sync);
    };

    sync();
    viewport?.addEventListener('resize', scheduleSync, { passive: true });
    viewport?.addEventListener('scroll', scheduleSync, { passive: true });
    window.addEventListener('resize', scheduleSync, { passive: true });
    window.addEventListener('orientationchange', scheduleSync, { passive: true });

    cleanupByModal.set(modal, () => {
        if (animationFrameId) window.cancelAnimationFrame(animationFrameId);
        viewport?.removeEventListener('resize', scheduleSync);
        viewport?.removeEventListener('scroll', scheduleSync);
        window.removeEventListener('resize', scheduleSync);
        window.removeEventListener('orientationchange', scheduleSync);
        modal.style.removeProperty(`--${propertyPrefix}-viewport-left`);
        modal.style.removeProperty(`--${propertyPrefix}-viewport-top`);
        modal.style.removeProperty(`--${propertyPrefix}-viewport-width`);
        modal.style.removeProperty(`--${propertyPrefix}-viewport-height`);
    });
}
