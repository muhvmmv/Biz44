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

const app = express(); 

// Middleware
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
app.use(morgan('dev'));
app.use(express.json());

// Routes 
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/products', productRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/accounting', accountingRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/report-notes', reportNotesRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/production', productionRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/customers', customerRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/employees', employeeRoutes);

// Unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// Error handler — must be registered after every route
app.use(errorHandler);

export default app;
