const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();

// Enable CORS
app.use(cors());

// Parse JSON
app.use(express.json());
app.use(express.static(__dirname)); 


app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// ===============================
// 📊 ANALYTICS SYSTEM
// ===============================
let analytics = {
  totalVisits: 0,
  pages: {}
};

// Track all requests
app.use((req, res, next) => {
  analytics.totalVisits++;

  const url = req.originalUrl;

  if (!analytics.pages[url]) {
    analytics.pages[url] = 0;
  }

  analytics.pages[url]++;

  next();
});

// ===============================
// 📂 FILE UPLOAD SETUP
// ===============================
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

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
let messages = []; // prayer/contact messages
let announcements = []; // announcements list

function generateId() {
  return Math.random().toString(36).substring(2, 12);
}

// ===============================
// 🔐 LOGIN
// ===============================
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  const validPassword = 'admin123';

  if (password === validPassword) {
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// ===============================
// 📚 CONTENT ROUTES
// ===============================

// Get all content
app.get('/api/content', (req, res) => {
  res.json(contents);
});

// Create content
app.post('/api/content', upload.single('file'), (req, res) => {
  const { title, category } = req.body;

  if (!title || !category || !req.file) {
    return res.status(400).json({ message: 'Title, category and file required' });
  }

  const uniqueCategories = ['Weekly Activities', 'Major Programs'];
  let item;

  if (uniqueCategories.includes(category)) {
    item = contents.find(c => c.category === category && c.title === title);

    if (!item) {
      item = contents.find(c => c.category === category);
    }

    if (item) {
      if (item.file) {
        const oldPath = path.join(UPLOAD_DIR, item.file);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      item.title = title;
      item.category = category;
      item.file = req.file.filename;
      item.updatedAt = new Date();

      return res.json(item);
    }
  }

  item = {
    _id: generateId(),
    title,
    category,
    file: req.file.filename,
    createdAt: new Date()
  };

  contents.push(item);
  res.json(item);
});

// Update content
app.put('/api/content/:id', upload.single('file'), (req, res) => {
  const id = req.params.id;
  const { title, category } = req.body;

  const item = contents.find(c => c._id === id);
  if (!item) return res.status(404).json({ message: 'Not found' });

  if (title) item.title = title;
  if (category) item.category = category;

  if (req.file) {
    if (item.file) {
      const oldPath = path.join(UPLOAD_DIR, item.file);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    item.file = req.file.filename;
  }

  res.json(item);
});

// Delete content
app.delete('/api/content/:id', (req, res) => {
  const id = req.params.id;

  const index = contents.findIndex(c => c._id === id);
  if (index === -1) return res.status(404).json({ message: 'Not found' });

  const [removed] = contents.splice(index, 1);

  if (removed.file) {
    const filePath = path.join(UPLOAD_DIR, removed.file);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  res.json({ success: true });
});

// ===============================
// 🙏 CONTACT / PRAYER REQUEST
// ===============================

// Submit message
app.post('/api/contact', (req, res) => {
  const { name, message } = req.body;

  if (!message) {
    return res.status(400).json({ message: 'Message is required' });
  }

  const newMessage = {
    _id: generateId(),
    name: name || "Anonymous",
    message,
    createdAt: new Date()
  };

  messages.push(newMessage);

  res.json({ success: true, message: 'Message sent successfully' });
});

// Get all messages
app.get('/api/contact', (req, res) => {
  res.json(messages);
});

// ===============================
// 📊 ANALYTICS ROUTE
// ===============================
app.get('/api/analytics', (req, res) => {
  res.json(analytics);
});

// ===============================
// 📢 ANNOUNCEMENTS
// ===============================

// Get all announcements
app.get('/api/announcements', (req, res) => {
  res.json(announcements);
});

// Add announcement
app.post('/api/announcements', (req, res) => {
  const { title, message } = req.body;

  if (!title || !message) {
    return res.status(400).json({ message: 'Title and message required' });
  }

  const newAnnouncement = {
    _id: generateId(),
    title,
    message,
    createdAt: new Date()
  };

  announcements.unshift(newAnnouncement); // newest on top

  res.json(newAnnouncement);
});

// Delete announcement
app.delete('/api/announcements/:id', (req, res) => {
  const id = req.params.id;

  const index = announcements.findIndex(a => a._id === id);
  if (index === -1) return res.status(404).json({ message: 'Not found' });

  announcements.splice(index, 1);

  res.json({ success: true });
});
// Update announcement
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

const PORT = process.env.PORT || 5000;

app.get('/', (req, res) => {
  res.send('Server is running!');
});

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});