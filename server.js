const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();

// ===============================
// 🚀 MIDDLEWARE
// ===============================
app.use(cors());
app.use(express.json());

// Serve static files (CSS, JS, images)
app.use(express.static(__dirname));

// ===============================
// 📊 ANALYTICS SYSTEM
// ===============================
let analytics = { totalVisits: 0, pages: {} };
app.use((req, res, next) => {
  analytics.totalVisits++;
  const url = req.originalUrl;
  if (!analytics.pages[url]) analytics.pages[url] = 0;
  analytics.pages[url]++;
  next();
});

// ===============================
// 📂 FILE UPLOAD SETUP
// ===============================
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use('/uploads', express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  }
});

const upload = multer({ storage });

// ===============================
// 📦 DATA STORAGE
// ===============================
let contents = [];
let messages = [];
let announcements = [];

function generateId() {
  return Math.random().toString(36).substring(2, 12);
}

// ===============================
// 🔐 LOGIN
// ===============================
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  const validPassword = 'admin123';
  res.json({ success: password === validPassword });
});

// ===============================
// 📚 CONTENT ROUTES
// ===============================
app.get('/api/content', (req, res) => res.json(contents));

app.post('/api/content', upload.single('file'), (req, res) => {
  const { title, category } = req.body;
  if (!title || !category || !req.file) return res.status(400).json({ message: 'Title, category, and file required' });

  const uniqueCategories = ['Weekly Activities', 'Major Programs'];
  let item;

  if (uniqueCategories.includes(category)) {
    item = contents.find(c => c.category === category && c.title === title);
    if (!item) item = contents.find(c => c.category === category);

    if (item) {
      if (item.file) fs.existsSync(path.join(UPLOAD_DIR, item.file)) && fs.unlinkSync(path.join(UPLOAD_DIR, item.file));
      item.title = title;
      item.category = category;
      item.file = req.file.filename;
      item.updatedAt = new Date();
      return res.json(item);
    }
  }

  item = { _id: generateId(), title, category, file: req.file.filename, createdAt: new Date() };
  contents.push(item);
  res.json(item);
});

app.put('/api/content/:id', upload.single('file'), (req, res) => {
  const id = req.params.id;
  const { title, category } = req.body;
  const item = contents.find(c => c._id === id);
  if (!item) return res.status(404).json({ message: 'Not found' });

  if (title) item.title = title;
  if (category) item.category = category;

  if (req.file) {
    if (item.file) fs.existsSync(path.join(UPLOAD_DIR, item.file)) && fs.unlinkSync(path.join(UPLOAD_DIR, item.file));
    item.file = req.file.filename;
  }

  res.json(item);
});

app.delete('/api/content/:id', (req, res) => {
  const id = req.params.id;
  const index = contents.findIndex(c => c._id === id);
  if (index === -1) return res.status(404).json({ message: 'Not found' });

  const [removed] = contents.splice(index, 1);
  if (removed.file) fs.existsSync(path.join(UPLOAD_DIR, removed.file)) && fs.unlinkSync(path.join(UPLOAD_DIR, removed.file));
  res.json({ success: true });
});

// ===============================
// 🙏 CONTACT / PRAYER REQUEST
// ===============================
app.post('/api/contact', (req, res) => {
  const { name, message } = req.body;
  if (!message) return res.status(400).json({ message: 'Message is required' });

  const newMessage = { _id: generateId(), name: name || 'Anonymous', message, createdAt: new Date() };
  messages.push(newMessage);
  res.json({ success: true, message: 'Message sent successfully' });
});

app.get('/api/contact', (req, res) => res.json(messages));

// ===============================
// 📊 ANALYTICS ROUTE
// ===============================
app.get('/api/analytics', (req, res) => res.json(analytics));

// ===============================
// 📢 ANNOUNCEMENTS
// ===============================
app.get('/api/announcements', (req, res) => res.json(announcements));

app.post('/api/announcements', (req, res) => {
  const { title, message } = req.body;
  if (!title || !message) return res.status(400).json({ message: 'Title and message required' });

  const newAnnouncement = { _id: generateId(), title, message, createdAt: new Date() };
  announcements.unshift(newAnnouncement);
  res.json(newAnnouncement);
});

app.put('/api/announcements/:id', (req, res) => {
  const id = req.params.id;
  const { title, message } = req.body;
  const item = announcements.find(a => a._id === id);
  if (!item) return res.status(404).json({ message: 'Not found' });

  if (title) item.title = title;
  if (message) item.message = message;
  item.updatedAt = new Date();
  res.json(item);
});

app.delete('/api/announcements/:id', (req, res) => {
  const id = req.params.id;
  const index = announcements.findIndex(a => a._id === id);
  if (index === -1) return res.status(404).json({ message: 'Not found' });
  announcements.splice(index, 1);
  res.json({ success: true });
});

// ===============================
// 🔑 FRONTEND ROUTES
// ===============================

// Serve admin.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Serve login.html at /login
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// ===============================
// START SERVER
// ===============================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});