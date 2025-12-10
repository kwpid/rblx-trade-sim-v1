import { useEffect, useRef } from 'react';
import './SnowEffect.css';

const SnowEffect = () => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let width = window.innerWidth;
        let height = window.innerHeight;

        canvas.width = width;
        canvas.height = height;

        const flakes = [];
        const flakeCount = 100;

        for (let i = 0; i < flakeCount; i++) {
            flakes.push({
                x: Math.random() * width,
                y: Math.random() * height,
                r: Math.random() * 2 + 1, // Smaller range 1-3
                d: Math.random() // Simplified density
            })
        }

        function draw() {
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
            ctx.beginPath();
            for (let i = 0; i < flakeCount; i++) {
                const f = flakes[i];
                ctx.moveTo(f.x, f.y);
                ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2, true);
            }
            ctx.fill();
            move();
        }

        let angle = 0;
        function move() {
            angle += 0.005; // Slower sway
            for (let i = 0; i < flakeCount; i++) {
                const f = flakes[i];
                // Slower fall speed: Base 0.5 + random
                f.y += 0.5 + f.d;
                f.x += Math.sin(angle) * 1; // Slower sway amount

                // Reset to top
                if (f.y > height) {
                    flakes[i] = { x: Math.random() * width, y: -10, r: f.r, d: f.d }; // Start above screen
                }
            }
        }

        let animationFrameId;
        function animate() {
            draw();
            animationFrameId = requestAnimationFrame(animate);
        }

        animate();

        const handleResize = () => {
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width;
            canvas.height = height;
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="snow-canvas"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                pointerEvents: 'none',
                zIndex: 9999
            }}
        />
    );
};

export default SnowEffect;
