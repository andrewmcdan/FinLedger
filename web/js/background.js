const canvas = document.getElementById("money-canvas");

if (canvas) {
    const ctx = canvas.getContext("2d");

    if (ctx) {
        const fontStack = '"Space Grotesk", "Avenir Next", "Segoe UI", sans-serif';
        const signs = [];
        const glyphCache = new Map();
        const minSignSize = 24;
        const maxSignSize = 54;
        const signSizeStep = 2;
        const maxCanvasDpr = 1.5;
        const resizeDebounceMs = 100;
        const activeFps = 60;
        const inactiveFps = 10;
        const motionSpeedMultiplier = 2;
        const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        let width = 0;
        let height = 0;
        let dpr = 1;
        let glyphCacheDpr = 1;
        let animationId = null;
        let resizeTimeoutId = null;
        let hasWindowFocus = document.hasFocus();
        let isPageVisible = !document.hidden;
        let targetFps = activeFps;
        let lastFrameTime = 0;

        const rand = (min, max) => Math.random() * (max - min) + min;
        const quantize = (value, step) => Math.round(value / step) * step;
        const quantizeSignSize = (value) => {
            const quantized = quantize(value, signSizeStep);
            return Math.min(maxSignSize, Math.max(minSignSize, quantized));
        };
        const updateTargetFps = () => {
            targetFps = hasWindowFocus && isPageVisible ? activeFps : inactiveFps;
        };

        const resetSign = (dollarSign) => {
            dollarSign.x = rand(0, width);
            dollarSign.y = rand(0, height);
            dollarSign.size = quantizeSignSize(rand(minSignSize, maxSignSize));
            dollarSign.speed = rand(0.15, 0.6);
            dollarSign.drift = rand(-0.2, 0.2);
            dollarSign.opacity = rand(0.05, 0.18);
            dollarSign.rotation = rand(-0.4, 0.4);
            dollarSign.rotationSpeed = rand(-0.002, 0.002);
            dollarSign.sprite = getGlyphSprite(dollarSign.size);
            dollarSign.spriteDpr = dpr;
        };

        const getGlyphSprite = (size) => {
            if (glyphCacheDpr !== dpr) {
                glyphCache.clear();
                glyphCacheDpr = dpr;
            }

            const cacheKey = size.toString();
            const cachedGlyph = glyphCache.get(cacheKey);
            if (cachedGlyph) {
                return cachedGlyph;
            }

            const glyphCanvas = document.createElement("canvas");
            const glyphCtx = glyphCanvas.getContext("2d");
            if (!glyphCtx) {
                return null;
            }

            glyphCtx.font = `${size}px ${fontStack}`;
            const metrics = glyphCtx.measureText("$");
            const textWidth = Math.ceil(metrics.width);
            const textHeight = Math.ceil(
                (metrics.actualBoundingBoxAscent || size * 0.8) +
                (metrics.actualBoundingBoxDescent || size * 0.2)
            );
            const padding = Math.ceil(size * 0.6);
            const logicalWidth = Math.max(1, textWidth + padding * 2);
            const logicalHeight = Math.max(1, textHeight + padding * 2);

            glyphCanvas.width = Math.max(1, Math.ceil(logicalWidth * dpr));
            glyphCanvas.height = Math.max(1, Math.ceil(logicalHeight * dpr));
            glyphCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
            glyphCtx.textAlign = "center";
            glyphCtx.textBaseline = "middle";
            glyphCtx.fillStyle = "#ffffff";
            glyphCtx.font = `${size}px ${fontStack}`;
            glyphCtx.fillText("$", logicalWidth / 2, logicalHeight / 2);

            const sprite = {
                canvas: glyphCanvas,
                width: logicalWidth,
                height: logicalHeight
            };
            glyphCache.set(cacheKey, sprite);
            return sprite;
        };

        const resize = () => {
            width = window.innerWidth;
            height = window.innerHeight;
            const nextDpr = Math.min(window.devicePixelRatio || 1, maxCanvasDpr);
            if (nextDpr !== dpr) {
                glyphCache.clear();
                glyphCacheDpr = nextDpr;
                for (const sign of signs) {
                    sign.sprite = null;
                    sign.spriteDpr = 0;
                }
            }
            dpr = nextDpr;
            canvas.width = Math.floor(width * dpr);
            canvas.height = Math.floor(height * dpr);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            // Calculate target number of signs based on screen size
            const targetCount = Math.max(18, Math.min(48, Math.floor((width * height) / 32000)));
            while (signs.length < targetCount) {
                const sign = {};
                resetSign(sign);
                signs.push(sign);
            }
            if (signs.length > targetCount) {
                signs.length = targetCount;
            }
        };

        const draw = () => {
            ctx.clearRect(0, 0, width, height);

            for (const sign of signs) {
                sign.y -= sign.speed * motionSpeedMultiplier;
                sign.x += sign.drift * motionSpeedMultiplier;
                sign.rotation += sign.rotationSpeed * motionSpeedMultiplier;

                if (sign.y < -40) {
                    sign.y = height + 40;
                    sign.x = rand(0, width);
                }

                if (sign.x < -40) {
                    sign.x = width + 40;
                } else if (sign.x > width + 40) {
                    sign.x = -40;
                }

                if (!sign.sprite || sign.spriteDpr !== dpr) {
                    sign.sprite = getGlyphSprite(sign.size);
                    sign.spriteDpr = dpr;
                }

                if (!sign.sprite) {
                    continue;
                }

                ctx.save();
                ctx.globalAlpha = sign.opacity;
                ctx.translate(sign.x, sign.y);
                ctx.rotate(sign.rotation);
                ctx.drawImage(
                    sign.sprite.canvas,
                    -sign.sprite.width / 2,
                    -sign.sprite.height / 2,
                    sign.sprite.width,
                    sign.sprite.height
                );
                ctx.restore();
            }
        };

        const step = (now) => {
            const frameInterval = 1000 / targetFps;
            if (!lastFrameTime || now - lastFrameTime >= frameInterval) {
                draw();
                lastFrameTime = now;
            }
            animationId = window.requestAnimationFrame(step);
        };

        const stop = () => {
            if (animationId) {
                window.cancelAnimationFrame(animationId);
                animationId = null;
            }
        };

        const start = () => {
            stop();
            updateTargetFps();
            lastFrameTime = 0;
            if (reducedMotionQuery.matches) {
                draw();
                return;
            }
            animationId = window.requestAnimationFrame(step);
        };

        const scheduleResize = () => {
            if (resizeTimeoutId) {
                window.clearTimeout(resizeTimeoutId);
            }

            resizeTimeoutId = window.setTimeout(() => {
                resizeTimeoutId = null;
                resize();
                start();
            }, resizeDebounceMs);
        };

        resize();
        start();

        window.addEventListener("resize", scheduleResize);

        reducedMotionQuery.addEventListener("change", () => {
            start();
        });

        window.addEventListener("focus", () => {
            hasWindowFocus = true;
            updateTargetFps();
        });

        window.addEventListener("blur", () => {
            hasWindowFocus = false;
            updateTargetFps();
        });

        document.addEventListener("visibilitychange", () => {
            isPageVisible = !document.hidden;
            updateTargetFps();
        });
    }
}
