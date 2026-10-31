import { useAuth } from '../context/AuthContext.jsx';
import FinanceDashboard from './FinanceDashboard.jsx';
import CustomerDashboard from './CustomerDashboard.jsx';

// Internal team sees the finance dashboard; customers see their own summary
export default function Dashboard() {
  const { user } = useAuth();
  return user.role === 'customer' ? <CustomerDashboard /> : <FinanceDashboard />;
}
