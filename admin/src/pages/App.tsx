/**
 * Composant App — routeur racine du plugin Comments.
 *
 * Route principale : Dashboard (KPIs + liste commentaires)
 * Route secondaire : Reports (signalements) et Settings (config)
 */

import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Flex, Loader } from '@strapi/design-system';

const Dashboard = lazy(() => import('./Dashboard'));
const Reports = lazy(() => import('./Reports'));
const Settings = lazy(() => import('./Settings'));

const PageLoader: React.FC = () => (
  <Flex justifyContent="center" alignItems="center" padding={10}>
    <Loader>Chargement...</Loader>
  </Flex>
);

const App: React.FC = () => (
  <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="reports" element={<Reports />} />
      <Route path="settings" element={<Settings />} />
    </Routes>
  </Suspense>
);

export default App;
