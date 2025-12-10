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
                r: Math.random() * 3 + 1,
                d: Math.random() * flakeCount
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
            angle += 0.01;
            for (let i = 0; i < flakeCount; i++) {
                const f = flakes[i];
                // Updating X and Y coordinates
                // We will add 1 to the cos function to prevent negative values which will move flakes upwards
                // Every particle has its own density which can be used to make the downward movement different for each flake
                // Lets make it more random by adding in the radius
                f.y += Math.pow(f.d, 2) + 1;
                f.x += Math.sin(angle) * 2;

                // Sending flakes back from the top when it exits
                // Lets make it a bit more organic and let flakes enter from the left and right also.
                if (f.y > height) {
                    flakes[i] = { x: Math.random() * width, y: 0, r: f.r, d: f.d };
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
