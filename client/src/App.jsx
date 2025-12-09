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
import Trade from './pages/Trade'
import Deals from './pages/Deals'
import Leaderboard from './pages/Leaderboard'
import Settings from './pages/Settings'
import ValueChanges from './pages/ValueChanges'
import AdminPanel from './pages/AdminPanel'
import PrivateRoute from './components/PrivateRoute'
import TopBar from './components/TopBar'
import NotificationContainer from './components/NotificationContainer'
import PaycheckNotification from './components/PaycheckNotification'
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
                        <Route path="/trade" element={<Trade />} />
                        <Route path="/deals" element={<Deals />} />
                        <Route path="/value-changes" element={<ValueChanges />} />
                        <Route path="/leaderboard" element={<Leaderboard />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/admin" element={<AdminPanel />} />
                      </Routes>
                    </div>
                    <NotificationContainer />
                    <PaycheckNotification />
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

