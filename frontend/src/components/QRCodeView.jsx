import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

const socket = io('http://localhost:3001');

const QRCodeView = ({ onConnected }) => {
    const [qrCode, setQrCode] = useState('');
    const [status, setStatus] = useState('Initializing WhatsApp...');
    const [showQR, setShowQR] = useState(true);

    useEffect(() => {
        socket.on('status_update', (status) => {
            console.log('Received status update:', status);
            if (status.state === 'qr') {
                setQrCode(status.data);
                setStatus('Scan the QR Code with WhatsApp');
                setShowQR(true);
            } else if (status.state === 'ready' || status.state === 'authenticated') {
                setStatus('WhatsApp is Ready!');
                setShowQR(false);
                onConnected(true);
            } else if (status.state === 'auth_failure') {
                setStatus(`Authentication Failed: ${status.data}`);
                setShowQR(false);
            }
        });

        socket.on('qr', (qr) => {
            setQrCode(qr);
            setStatus('Scan the QR Code with WhatsApp');
            setShowQR(true);
        });

        socket.on('ready', () => {
            setStatus('WhatsApp is Ready!');
            setShowQR(false);
            onConnected(true);
        });

        socket.on('authenticated', () => {
            setStatus('Authenticated! Getting ready...');
            setShowQR(false);
        });

        socket.on('auth_failure', (msg) => {
            setStatus(`Authentication Failed: ${msg}`);
            setShowQR(false);
        });

        return () => {
            socket.off('status_update');
            socket.off('qr');
            socket.off('ready');
            socket.off('authenticated');
            socket.off('auth_failure');
        };
    }, [onConnected]);

    return (
        <div className="qr-container">
            <div className="qr-card glass-pane">
                <h2>Connect WhatsApp 📱</h2>
                <p className="status-text" style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    {status}
                </p>

                {showQR && qrCode && (
                    <div className="qr-image-wrapper">
                        <img src={qrCode} alt="WhatsApp QR Code" className="qr-image" />
                    </div>
                )}

                {!showQR && status === 'WhatsApp is Ready!' && (
                    <div className="success-state">
                        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✅</div>
                        <h3 style={{ color: 'var(--success-color)' }}>Connected Successfully</h3>
                        <p style={{ color: 'var(--text-secondary)' }}>Welcome back to your dashboard</p>
                    </div>
                )}

                <div className="qr-instructions" style={{ marginTop: '2rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    <p>1. Open WhatsApp on your phone</p>
                    <p>2. Tap Menu or Settings and select Linked Devices</p>
                    <p>3. Point your phone to this screen to capture the code</p>
                </div>
            </div>
        </div>
    );
};

export default QRCodeView;
