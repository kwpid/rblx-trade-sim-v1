const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .or(`username.eq.${username},email.eq.${email}`)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const { data: user, error } = await supabase
      .from('users')
      .insert([
        {
          username,
          email,
          password: hashedPassword,
          cash: 100000,
          is_admin: false
        }
      ])
      .select()
      .single();

    if (error) throw error;

    // Generate token
    const token = jwt.sign(
      { userId: user.id, username: user.username, isAdmin: user.is_admin },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, username: user.username, email: user.email, cash: user.cash, is_admin: user.is_admin } });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { usernameOrEmail, password } = req.body;

    if (!usernameOrEmail || !password) {
      return res.status(400).json({ error: 'Username/email and password are required' });
    }

    // Find user by username or email
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .or(`username.eq.${usernameOrEmail},email.eq.${usernameOrEmail}`)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id, username: user.username, isAdmin: user.is_admin },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, username: user.username, email: user.email, cash: user.cash, is_admin: user.is_admin } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Verify token
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    const { data: user } = await supabase
      .from('users')
      .select('id, username, email, cash, is_admin')
      .eq('id', decoded.userId)
      .single();

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;

