import React from 'react';
import './TermsOfService.css';

const TermsOfService = () => {
    return (
        <div className="tos-page">
            <div className="container">
                <h1>Terms of Service</h1>
                <div className="tos-content">
                    <section>
                        <h2>1. Introduction</h2>
                        <p>Welcome to Roblox Trade Simulator. By accessing our website, you agree to be bound by these Terms of Service.</p>
                    </section>

                    <section>
                        <h2>2. User Conduct</h2>
                        <p>You agree not to engage in any of the following prohibited activities:</p>
                        <ul>
                            <li>abusing glitches or bugs for economic gain;</li>
                            <li>scamming or defrauding other players;</li>
                            <li>harassing or bullying other users;</li>
                            <li>using automated scripts or bots (exploiting).</li>
                        </ul>
                    </section>

                    <section>
                        <h2>3. Virtual Items</h2>
                        <p>All items and currency in this simulation are virtual and have no real-world value. We reserve the right to modify, wipe, or remove items at any time.</p>
                    </section>

                    <section>
                        <h2>4. Moderation</h2>
                        <p>We reserve the right to warn, ban, or wipe accounts that violate these terms. Bans may be temporary or permanent depending on the severity of the violation.</p>
                    </section>

                    <section>
                        <h2>5. Disclaimer</h2>
                        <p>This is a fan-made simulation and is not affiliated with Roblox Corporation.</p>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default TermsOfService;
