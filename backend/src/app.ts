import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import authRoutes from './modules/auth/auth.routes';
import { errorHandler } from './middleware/errorHandler';
import { env } from './config/env';
import customerRoutes from './modules/customers/customers.routes';
import supplierRoutes from './modules/suppliers/suppliers.routes';
import employeeRoutes from './modules/employees/employee.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import productRoutes from './modules/products/products.routes';
import stockRoutes from './modules/stock/stock.routes';
import paymentRoutes from './modules/payments/payments.routes';
import accountingRoutes from './modules/accounting/accounting.routes';
import payrollRoutes from './modules/payroll/payroll.routes';
import attendanceRoutes from './modules/attendance/attendance.routes';
import leaveRoutes from './modules/leave/leave.routes';
import reportRoutes from './modules/reports/reports.routes';
import settingsRoutes from './modules/settings/settings.routes';
import invoiceRoutes from './modules/invoices/invoices.routes';
import reportNotesRoutes from './modules/reports/notes.routes';
import purchaseRoutes from './modules/purchases/purchases.routes';
import locationRoutes from './modules/locations/locations.routes';
import productionRoutes from './modules/production/production.routes';
import userRoutes from './modules/users/users.routes';
import transferRoutes from './modules/transfers/transfers.routes';
import { authorize } from './middleware/auth';

const app = express(); 

// Middleware
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
app.use(morgan('dev'));
app.use(express.json());

// Routes. Each area is limited by role (src/lib/permissions.ts): reading for
// GET, writing for anything else. Routers also authenticate themselves.
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', ...authorize('settings'), dashboardRoutes); // every role; figures filtered inside
app.use('/api/products', ...authorize('inventory'), productRoutes);
app.use('/api/stock', ...authorize('inventory', [
  { path: /^\/(receive|supplier-return)$/, methods: ['POST'], areas: ['purchasing'] },
]), stockRoutes);
app.use('/api/production', ...authorize('inventory'), productionRoutes);
app.use('/api/stock-transfers', ...authorize('inventory'), transferRoutes);
app.use('/api/payments', ...authorize('sales'), paymentRoutes);
app.use('/api/invoices', ...authorize('sales'), invoiceRoutes);
app.use('/api/customers', ...authorize('sales'), customerRoutes);
app.use('/api/suppliers', ...authorize('purchasing'), supplierRoutes);
app.use('/api/purchases', ...authorize('purchasing', [
  { path: /^\/[^/]+\/pay$/, methods: ['POST'], areas: ['money'] },
]), purchaseRoutes);
app.use('/api/accounting', ...authorize('money', [
  // Choosing the cash or bank account a payment goes into or out of.
  { path: /^\/payment-accounts$/, methods: ['GET'], areas: ['money', 'sales', 'purchasing'] },
  { path: /^\/receivable$/, methods: ['GET'], areas: ['money', 'sales'] },
  { path: /^\/payable$/, methods: ['GET'], areas: ['money', 'purchasing'] },
]), accountingRoutes);
app.use('/api/payroll', ...authorize('payroll'), payrollRoutes);
app.use('/api/employees', ...authorize('hr'), employeeRoutes);
app.use('/api/attendance', ...authorize('hr'), attendanceRoutes);
app.use('/api/leave', ...authorize('hr'), leaveRoutes);
app.use('/api/reports', ...authorize('reports'), reportRoutes);
app.use('/api/report-notes', ...authorize('reports'), reportNotesRoutes);
app.use('/api/settings', ...authorize('settings'), settingsRoutes);
app.use('/api/locations', ...authorize('settings'), locationRoutes);
app.use('/api/users', ...authorize('settings'), userRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// Error handler — must be registered after every route
app.use(errorHandler);

export default app;
