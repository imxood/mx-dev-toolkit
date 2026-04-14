export const TOAST_HOST_MARKUP = `<div id="mx-toast-root" class="mx-toast-root" role="status" aria-live="polite" aria-atomic="false"></div>`;

export const TOAST_HOST_STYLES = String.raw`
  .mx-toast-root {
    position: fixed;
    top: 12px;
    right: 14px;
    z-index: 50;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    pointer-events: none;
  }

  .mx-toast-item {
    pointer-events: auto;
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr) 26px;
    align-items: center;
    gap: 10px;
    width: min(328px, calc(100vw - 28px));
    min-height: 36px;
    padding: 7px 8px 7px 9px;
    border: 1px solid var(--border-soft, rgba(128, 128, 128, 0.2));
    border-radius: 9px;
    background: color-mix(in srgb, var(--surface, rgba(30, 30, 30, 0.96)) 90%, transparent);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.18);
    backdrop-filter: blur(14px);
    animation: mx-toast-enter 150ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .mx-toast-placeholder {
    width: min(328px, calc(100vw - 28px));
    pointer-events: none;
    opacity: 0;
  }

  .mx-toast-item::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--mx-toast-accent, var(--focus, #007fd4));
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--mx-toast-accent, var(--focus, #007fd4)) 18%, transparent);
  }

  .mx-toast-item.info {
    --mx-toast-accent: var(--focus, #007fd4);
    border-color: color-mix(in srgb, var(--focus, #007fd4) 28%, var(--border-soft, rgba(128, 128, 128, 0.2)));
  }

  .mx-toast-item.success {
    --mx-toast-accent: var(--success, #73c991);
    border-color: color-mix(in srgb, var(--success, #73c991) 28%, var(--border-soft, rgba(128, 128, 128, 0.2)));
  }

  .mx-toast-item.warning {
    --mx-toast-accent: var(--warning, #d7ba7d);
    border-color: color-mix(in srgb, var(--warning, #d7ba7d) 30%, var(--border-soft, rgba(128, 128, 128, 0.2)));
  }

  .mx-toast-item.error {
    --mx-toast-accent: var(--danger, #f48771);
    border-color: color-mix(in srgb, var(--danger, #f48771) 30%, var(--border-soft, rgba(128, 128, 128, 0.2)));
  }

  .mx-toast-message {
    min-width: 0;
    color: var(--text, #cccccc);
    font-size: 12px;
    line-height: 1.35;
    letter-spacing: 0.01em;
    word-break: break-word;
  }

  .mx-toast-copy {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--muted, #9a9a9a);
    transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
  }

  .mx-toast-copy:hover {
    border-color: var(--input-border, rgba(128, 128, 128, 0.28));
    background: var(--hover-bg, rgba(255, 255, 255, 0.05));
    color: var(--text, #cccccc);
  }

  .mx-toast-copy.copied {
    color: var(--mx-toast-accent, var(--focus, #007fd4));
  }

  .mx-toast-copy svg {
    width: 14px;
    height: 14px;
    fill: currentColor;
  }

  @keyframes mx-toast-enter {
    from {
      opacity: 0;
      transform: translateY(-6px) scale(0.985);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (max-width: 760px) {
    .mx-toast-root {
      top: 10px;
      right: 10px;
      left: 10px;
      align-items: stretch;
    }

    .mx-toast-item {
      width: 100%;
    }

    .mx-toast-placeholder {
      width: 100%;
    }
  }
`;

export const TOAST_HOST_SCRIPT = String.raw`
      const mxToastCenter = (function() {
        const MAX_TOASTS = 8;
        const items = [];
        let activeHoverToastId = null;

        function escapeToastHtml(value) {
          return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        }

        function getRoot() {
          return document.getElementById("mx-toast-root");
        }

        function getToastElement(id) {
          const root = getRoot();
          if (!root) {
            return null;
          }
          return root.querySelector('[data-toast-id="' + id + '"]');
        }

        function findItem(id) {
          return items.find(function(item) {
            return item.id === id;
          }) || null;
        }

        function clearToastTimer(item) {
          if (item.timerHandle) {
            clearTimeout(item.timerHandle);
            item.timerHandle = null;
          }
        }

        function clearCopyTimer(item) {
          if (item.copyTimerHandle) {
            clearTimeout(item.copyTimerHandle);
            item.copyTimerHandle = null;
          }
        }

        function removeToast(id) {
          const index = items.findIndex(function(item) {
            return item.id === id;
          });
          if (index < 0) {
            return;
          }
          const item = items[index];
          clearToastTimer(item);
          clearCopyTimer(item);
          const hoveredIndex = activeHoverToastId
            ? items.findIndex(function(entry) {
                return entry.id === activeHoverToastId;
              })
            : -1;
          const shouldKeepPlaceholder = hoveredIndex >= 0 && index < hoveredIndex;
          if (shouldKeepPlaceholder) {
            const element = getToastElement(id);
            item.placeholder = true;
            item.placeholderHeight = element ? element.getBoundingClientRect().height : (item.placeholderHeight || 36);
            item.paused = false;
            item.copied = false;
            render();
            return;
          }
          items.splice(index, 1);
          render();
        }

        function pruneRemovedToasts() {
          for (let index = items.length - 1; index >= 0; index -= 1) {
            if (items[index].placeholder) {
              items.splice(index, 1);
            }
          }
        }

        function scheduleToast(item) {
          clearToastTimer(item);
          if (!(item.remainingMs > 0)) {
            return;
          }
          item.startedAt = Date.now();
          item.timerHandle = setTimeout(function() {
            removeToast(item.id);
          }, item.remainingMs);
        }

        function pauseToast(id) {
          const item = findItem(id);
          if (!item || item.paused || item.durationMs <= 0) {
            return;
          }
          const elapsed = item.startedAt > 0 ? Date.now() - item.startedAt : 0;
          item.remainingMs = Math.max(0, item.remainingMs - elapsed);
          item.paused = true;
          activeHoverToastId = id;
          clearToastTimer(item);
        }

        function resumeToast(id) {
          const item = findItem(id);
          if (!item || !item.paused || item.durationMs <= 0) {
            return;
          }
          item.paused = false;
          if (activeHoverToastId === id) {
            activeHoverToastId = null;
            pruneRemovedToasts();
            render();
          }
          scheduleToast(item);
        }

        function trimToasts() {
          while (items.length > MAX_TOASTS) {
            const removable = items.find(function(item) {
              return !item.paused;
            }) || items[0];
            removeToast(removable.id);
          }
        }

        function markCopied(id) {
          const item = findItem(id);
          if (!item) {
            return;
          }
          item.copied = true;
          clearCopyTimer(item);
          render();
          item.copyTimerHandle = setTimeout(function() {
            item.copied = false;
            item.copyTimerHandle = null;
            render();
          }, 1200);
        }

        function render() {
          const root = getRoot();
          if (!root) {
            return;
          }
          root.innerHTML = items.map(function(item) {
            if (item.placeholder) {
              return '<div class="mx-toast-placeholder" style="height:' + Math.max(0, Number(item.placeholderHeight) || 36) + 'px;"></div>';
            }
            const copiedClass = item.copied ? " copied" : "";
            const copiedTitle = item.copied ? "已复制" : "复制提示内容";
            const icon = item.copied
              ? '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6.5 11.4 3.6 8.5l-.7.7 3.6 3.6 6.6-6.6-.7-.7-5.9 5.9Z"></path></svg>'
              : '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M5.5 2.5h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Zm0 1a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-6Z"></path><path d="M3 4.5H2.5A1.5 1.5 0 0 0 1 6v6.5A1.5 1.5 0 0 0 2.5 14H9v-1H2.5a.5.5 0 0 1-.5-.5V6a.5.5 0 0 1 .5-.5H3v-1Z"></path></svg>';
            return (
              '<div class="mx-toast-item ' + item.kind + '" data-toast-id="' + item.id + '">' +
                '<div class="mx-toast-message" title="' + escapeToastHtml(item.message) + '">' + escapeToastHtml(item.message) + '</div>' +
                '<button class="mx-toast-copy' + copiedClass + '" type="button" data-toast-action="copy" data-toast-id="' + item.id + '" title="' + copiedTitle + '" aria-label="' + copiedTitle + '">' +
                  icon +
                '</button>' +
              '</div>'
            );
          }).join("");

          root.querySelectorAll(".mx-toast-item").forEach(function(element) {
            const toastId = element.getAttribute("data-toast-id");
            if (!toastId) {
              return;
            }
            element.addEventListener("mouseenter", function() {
              pauseToast(toastId);
            });
            element.addEventListener("mouseleave", function() {
              resumeToast(toastId);
            });
          });

          root.querySelectorAll('[data-toast-action="copy"]').forEach(function(button) {
            button.addEventListener("click", function(event) {
              event.preventDefault();
              event.stopPropagation();
              const toastId = button.getAttribute("data-toast-id");
              if (!toastId) {
                return;
              }
              const item = findItem(toastId);
              if (!item) {
                return;
              }
              navigator.clipboard.writeText(item.copyText || item.message).then(function() {
                markCopied(toastId);
              });
            });
          });
        }

        function push(toast) {
          const item = {
            id: toast.id,
            kind: toast.kind || "info",
            message: String(toast.message || ""),
            copyText: String(toast.copyText || toast.message || ""),
            durationMs: Number.isFinite(toast.durationMs) ? Math.max(0, Number(toast.durationMs)) : 2400,
            startedAt: 0,
            remainingMs: Number.isFinite(toast.durationMs) ? Math.max(0, Number(toast.durationMs)) : 2400,
            timerHandle: null,
            paused: false,
            copied: false,
            copyTimerHandle: null,
            placeholder: false,
            placeholderHeight: 0
          };
          items.push(item);
          trimToasts();
          render();
          scheduleToast(item);
        }

        return {
          push: push
        };
      })();

      window.__mxToastCenter = mxToastCenter;
`;
