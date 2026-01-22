const canvas = document.getElementById("money-canvas");

if (canvas) {
    const ctx = canvas.getContext("2d");

    if (ctx) {
        const fontStack = '"Space Grotesk", "Avenir Next", "Segoe UI", sans-serif';
        const signs = [];
        let width = 0;
        let height = 0;
        let dpr = 1;
        let animationId = null;

        const rand = (min, max) => Math.random() * (max - min) + min;

        const resetSign = (dollarSign) => {
            dollarSign.x = rand(0, width);
            dollarSign.y = rand(0, height);
            dollarSign.size = rand(14, 34);
            dollarSign.speed = rand(0.15, 0.6);
            dollarSign.drift = rand(-0.2, 0.2);
            dollarSign.opacity = rand(0.05, 0.18);
            dollarSign.rotation = rand(-0.4, 0.4);
            dollarSign.rotationSpeed = rand(-0.002, 0.002);
        };

        const resize = () => {
            width = window.innerWidth;
            height = window.innerHeight;
            dpr = window.devicePixelRatio || 1;
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
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#ffffff";

            for (const sign of signs) {
                sign.y -= sign.speed;
                sign.x += sign.drift;
                sign.rotation += sign.rotationSpeed;

                if (sign.y < -40) {
                    sign.y = height + 40;
                    sign.x = rand(0, width);
                }

                if (sign.x < -40) {
                    sign.x = width + 40;
                } else if (sign.x > width + 40) {
                    sign.x = -40;
                }

                ctx.save();
                ctx.globalAlpha = sign.opacity;
                ctx.translate(sign.x, sign.y);
                ctx.rotate(sign.rotation);
                ctx.font = `${sign.size}px ${fontStack}`;
                ctx.fillText("$", 0, 0);
                ctx.restore();
            }
        };

        const step = () => {
            draw();
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
            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                draw();
                return;
            }
            animationId = window.requestAnimationFrame(step);
        };

        resize();
        start();

        window.addEventListener("resize", () => {
            resize();
            start();
        });

        window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", () => {
            start();
        });

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                stop();
            } else {
                start();
            }
        });
    }
}
