import { BarChart3 } from 'lucide-react';

interface HomePageProps {
    onNavigateToDashboard: () => void;
}

const HomePage = ({ onNavigateToDashboard }: HomePageProps) => {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            gap: '2rem',
            padding: '2rem',
        }}>
            <div style={{ textAlign: 'center' }}>
                <h1 style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>STRC Dashboard</h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
                    Track your stock accumulation and dividends
                </p>
            </div>

            <button
                onClick={onNavigateToDashboard}
                className="btn btn-primary"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '14px 32px',
                    fontSize: '1rem',
                    borderRadius: '12px',
                }}
            >
                <BarChart3 size={20} />
                Open Dashboard
            </button>
        </div>
    );
};

export default HomePage;
