import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';

// Pages load on demand, so the first visit downloads only what it needs
const Signup = lazy(() => import('./pages/Signup.jsx'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Customers = lazy(() => import('./pages/Customers.jsx'));
const Users = lazy(() => import('./pages/Users.jsx'));
const Products = lazy(() => import('./pages/Products.jsx'));
const Plans = lazy(() => import('./pages/Plans.jsx'));
const Taxes = lazy(() => import('./pages/Taxes.jsx'));
const Templates = lazy(() => import('./pages/Templates.jsx'));
const Subscriptions = lazy(() => import('./pages/Subscriptions.jsx'));
const SubscriptionForm = lazy(() => import('./pages/SubscriptionForm.jsx'));
const SubscriptionDetail = lazy(() => import('./pages/SubscriptionDetail.jsx'));
const Invoices = lazy(() => import('./pages/Invoices.jsx'));
const InvoiceDetail = lazy(() => import('./pages/InvoiceDetail.jsx'));
const InvoicePrint = lazy(() => import('./pages/InvoicePrint.jsx'));
const Payments = lazy(() => import('./pages/Payments.jsx'));
const Discounts = lazy(() => import('./pages/Discounts.jsx'));
const ActivityLog = lazy(() => import('./pages/ActivityLog.jsx'));

function PageLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="Loading">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoading />}>
    <Routes>
      {/* Public pages */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Logged-in pages */}
      <Route element={<ProtectedRoute />}>
        <Route path="/invoices/:id/print" element={<InvoicePrint />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/subscriptions" element={<Subscriptions />} />
          <Route path="/subscriptions/:id" element={<SubscriptionDetail />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/invoices/:id" element={<InvoiceDetail />} />
          <Route path="/payments" element={<Payments />} />

          <Route element={<ProtectedRoute roles={['admin', 'staff']} />}>
            <Route path="/customers" element={<Customers />} />
            <Route path="/products" element={<Products />} />
            <Route path="/plans" element={<Plans />} />
            <Route path="/taxes" element={<Taxes />} />
            <Route path="/discounts" element={<Discounts />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/activity" element={<ActivityLog />} />
            <Route path="/subscriptions/new" element={<SubscriptionForm />} />
            <Route path="/subscriptions/:id/edit" element={<SubscriptionForm />} />
          </Route>

          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="/team" element={<Users />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
