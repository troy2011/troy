const closeBindings = new WeakMap();

function isElementOpen(element) {
    if (!element?.isConnected) return false;
    if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
}

function runClose(binding, event) {
    if (binding.button?.disabled) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    binding.close(event);
}

/**
 * Gives every modal close control the same click, backdrop and Escape behavior.
 * Rebinding the same button updates its callbacks without stacking listeners.
 */
export function bindModalClose(button, close, options = {}) {
    if (!(button instanceof HTMLElement) || typeof close !== 'function') return null;

    let binding = closeBindings.get(button);
    if (!binding) {
        binding = {
            button,
            close,
            overlay: null,
            closeOnBackdrop: false,
            closeOnEscape: false,
            isOpen: null
        };
        binding.onButtonClick = (event) => runClose(binding, event);
        binding.onOverlayClick = (event) => {
            if (binding.closeOnBackdrop && event.target === binding.overlay) runClose(binding, event);
        };
        binding.onDocumentKeydown = (event) => {
            if (event.key !== 'Escape' || !binding.closeOnEscape) return;
            const open = typeof binding.isOpen === 'function'
                ? binding.isOpen()
                : isElementOpen(binding.overlay);
            if (open) runClose(binding, event);
        };
        button.addEventListener('click', binding.onButtonClick);
        closeBindings.set(button, binding);
    }

    if (binding.overlay && binding.closeOnBackdrop) {
        binding.overlay.removeEventListener('click', binding.onOverlayClick);
    }
    if (binding.closeOnEscape) {
        document.removeEventListener('keydown', binding.onDocumentKeydown);
    }

    binding.close = close;
    binding.overlay = options.overlay instanceof HTMLElement ? options.overlay : null;
    binding.closeOnBackdrop = options.closeOnBackdrop === true;
    binding.closeOnEscape = options.closeOnEscape === true;
    binding.isOpen = typeof options.isOpen === 'function' ? options.isOpen : null;

    button.type = 'button';
    if (!button.getAttribute('aria-label')) button.setAttribute('aria-label', '閉じる');
    if (options.icon === true) button.classList.add('ui-modal-close');
    button.dataset.modalCloseBound = 'true';

    if (binding.overlay && binding.closeOnBackdrop) {
        binding.overlay.addEventListener('click', binding.onOverlayClick);
    }
    if (binding.closeOnEscape) {
        document.addEventListener('keydown', binding.onDocumentKeydown);
    }
    return binding;
}

export function createModalCloseButton({ className = '', label = '閉じる' } = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = ['ui-modal-close', className].filter(Boolean).join(' ');
    button.setAttribute('aria-label', label);
    return button;
}

export function bindTargetModalCloseButtons(root = document) {
    root.querySelectorAll('[data-modal-close-target]').forEach((button) => {
        const targetId = String(button.getAttribute('data-modal-close-target') || '').trim();
        const overlay = targetId ? document.getElementById(targetId) : null;
        if (!overlay) return;
        bindModalClose(button, () => {
            overlay.style.display = 'none';
            overlay.setAttribute('aria-hidden', 'true');
        }, {
            overlay,
            closeOnBackdrop: true,
            closeOnEscape: true,
            icon: button.classList.contains('ui-modal-close')
        });
    });
}

if (typeof window !== 'undefined') {
    window.TroyModalClose = Object.freeze({ bindModalClose, createModalCloseButton, bindTargetModalCloseButtons });
}
