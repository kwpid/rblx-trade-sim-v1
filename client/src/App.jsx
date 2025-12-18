import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { NotificationProvider } from './contexts/NotificationContext'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Catalog from './pages/Catalog'
import ItemDetail from './pages/ItemDetail'
import Profile from './pages/Profile'
import Players from './pages/Players'
import TradeWindow from './pages/TradeWindow'
import Trades from './pages/Trades'
// import Deals from './pages/Deals'
import Leaderboard from './pages/Leaderboard'
import Settings from './pages/Settings'
// import TradeDetails from './pages/TradeDetails'

import ValueChanges from './pages/ValueChanges'
import Transactions from './pages/Transactions'
import AdminPanel from './pages/AdminPanel'
import PrivateRoute from './components/PrivateRoute'
import TopBar from './components/TopBar'
import NotificationContainer from './components/NotificationContainer'
import PaycheckNotification from './components/PaycheckNotification'
import VersionManager from './components/VersionManager'
import BannedOverlay from './components/BannedOverlay'
import Footer from './components/Footer'
import TermsOfService from './pages/TermsOfService'
import './App.css'

function App() {
  return (
    <Router>
      <AuthProvider>
        <NotificationProvider>
          <div className="app">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route
                path="/*"
                element={
                  <PrivateRoute>
                    <TopBar />
                    <div className="main-content">
                      <Routes>
                        <Route path="/" element={<Catalog />} />
                        <Route path="/catalog" element={<Catalog />} />
                        <Route path="/catalog/:id" element={<ItemDetail />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/players" element={<Players />} />
                        <Route path="/players/:id" element={<Profile />} />
                        <Route path="/trade" element={<Navigate to="/trades" replace />} />
                        <Route path="/trades" element={<Trades />} />
                        <Route path="/trades/:id" element={<TradeWindow />} />
                        {/* <Route path="/deals" element={<Deals />} /> */}

                        <Route path="/value-changes" element={<ValueChanges />} />
                        <Route path="/transactions" element={<Transactions />} />
                        <Route path="/leaderboard" element={<Leaderboard />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/admin" element={<AdminPanel />} />
                        <Route path="/tos" element={<TermsOfService />} />
                      </Routes>
                    </div>
                    <NotificationContainer />
                    <NotificationContainer />
                    <UpdateLogsPopup />
                    <BannedOverlay />
                    <Footer />
                  </PrivateRoute>
                }
              />
            </Routes>
          </div>
        </NotificationProvider>
      </AuthProvider>
    </Router>
  )
}

export default App

