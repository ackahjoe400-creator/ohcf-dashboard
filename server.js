const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();

// ===============================
// 🚀 SUPABASE CLIENT
// ===============================
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// ===============================
// 🚀 MIDDLEWARE
// ===============================
app.use(cors());
app.use(express.json());

// Serve static files (CSS, JS, images)
app.use(express.static(__dirname));

// ===============================
// 📊 ANALYTICS SYSTEM (in‑memory, optional)
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
// 📂 FILE UPLOAD SETUP (multer – in‑memory for Supabase)
// ===============================
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ===============================
// 🔐 LOGIN (unchanged)
// ===============================
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  const validPassword = 'admin123';
  res.json({ success: password === validPassword });
});

  // ===============================
// 📚 CONTENT ROUTES
// ===============================

// GET all content
app.get('/api/content', async (req, res) => {
  const { data, error } = await supabase
    .from('contents')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  res.json(data);
});


// POST new content (with file upload)
app.post('/api/content', upload.single('file'), async (req, res) => {
  try {
    const { title, } = req.body;

    // Validate input
    if (!title || !req.file) {
      return res.status(400).json({ message: 'Title and file required' });
    }

    // Create unique file path
    const fileExt = path.extname(req.file.originalname);
    const filePath = `content/${Date.now()}-${Math.round(Math.random() * 1e9)}${fileExt}`;

    // Upload file to Supabase Storage (downloads bucket)
    const { error: uploadError } = await supabase.storage
      .from('downloads')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return res.status(500).json({ error: uploadError.message });
    }

    // Get public URL
    const { data } = supabase.storage.from('downloads').getPublicUrl(filePath);
    const publicURL = data.publicUrl;

    // ✅ INSERT INTO DATABASE (THIS IS YOUR LINE)
    const { data: dbData, error: dbError } = await supabase
      .from('contents')
      .insert([
        {
          title,
          file_url: publicURL,
          file_path: filePath,
          file_name: req.file.originalname
        }
      ])
      .select()
      .single();

    if (dbError) {
      console.error("DB insert error:", dbError);
      return res.status(500).json({ error: dbError.message });
    }

    res.json(dbData);

  } catch (err) {
    console.error('POST /content error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// UPDATE content (optional new file)
app.put('/api/content/:id', upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, } = req.body;

    const { data: existing, error: fetchError } = await supabase
      .from('contents')
      .select('file_url,file_path,title')
      .eq('_id', id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      return res.status(500).json({ error: fetchError.message });
    }

    let newFileUrl = existing?.file_url;
    let newFilePath = existing?.file_path;

    // If new file uploaded
    if (req.file) {
      const fileExt = path.extname(req.file.originalname);
      const filePath = `content/${Date.now()}-${Math.round(Math.random() * 1e9)}${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('downloads')
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          cacheControl: '3600'
        });

      if (uploadError) return res.status(500).json({ error: uploadError.message });

      const { data } = supabase.storage.from('downloads').getPublicUrl(filePath);
      newFileUrl = data.publicUrl;
      newFilePath = filePath;

      // Delete old file
      if (existing?.file_path) {
        await supabase.storage.from('downloads').remove([existing.file_path]);
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('contents')
      .update({
        title: title || existing?.title,
        file_url: newFileUrl,
        file_path: newFilePath,
        updated_at: new Date()
      })
      .eq('_id', id)
      .select()
      .single();

    if (updateError) return res.status(500).json({ error: updateError.message });

    res.json(updated);

  } catch (err) {
    console.error('PUT /content/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// DELETE content
app.delete('/api/content/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existing, error: fetchError } = await supabase
      .from('contents')
      .select('file_path')
      .eq('_id', id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      return res.status(500).json({ error: fetchError.message });
    }

    // Delete DB record
    const { error: deleteError } = await supabase
      .from('contents')
      .delete()
      .eq('_id', id);

    if (deleteError) return res.status(500).json({ error: deleteError.message });

    // Delete file from storage
    if (existing?.file_path) {
      await supabase.storage.from('downloads').remove([existing.file_path]);
    }

    res.json({ success: true });

  } catch (err) {
    console.error('DELETE /content/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});  

// ===============================
// 🙏 CONTACT / PRAYER REQUEST (using existing 'prayer_requests' table)
// ===============================
app.post('/api/contact', async (req, res) => {
  const { name, message } = req.body;
  if (!message) return res.status(400).json({ message: 'Message is required' });

  const { error } = await supabase
    .from('prayer_requests')
    .insert([{ name: name || 'Anonymous', message }]);
  if (error) {
    console.error('Insert prayer request error:', error);
    return res.status(500).json({ error: error.message });
  }
  res.json({ success: true, message: 'Message sent successfully' });
});

app.get('/api/contact', async (req, res) => {
  const { data, error } = await supabase
    .from('prayer_requests')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Select prayer requests error:', error);
    return res.status(500).json([]);
  }
  res.json(data);
});

// ===============================
// 📊 ANALYTICS ROUTE (in‑memory, optional)
// ===============================
app.get('/api/analytics', (req, res) => res.json(analytics));

// ===============================
// 📢 ANNOUNCEMENTS (using existing 'announcements' table with 'content' column)
// ===============================
app.get('/api/announcements', async (req, res) => {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Select announcements error:', error);
    return res.status(500).json([]);
  }
  res.json(data);
});

app.post('/api/announcements', async (req, res) => {
  const { title, message } = req.body; // frontend sends 'message'
  if (!title || !message) return res.status(400).json({ message: 'Title and message required' });

  // Map frontend 'message' to table column 'content'
  const { data, error } = await supabase
    .from('announcements')
    .insert([{ title, content: message }])
    .select()
    .single();
  if (error) {
    console.error('Insert announcement error:', error);
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

app.put('/api/announcements/:id', async (req, res) => {
  const { id } = req.params;
  const { title, message } = req.body;

  const { data, error } = await supabase
    .from('announcements')
    .update({ title, content: message, updated_at: new Date() })
    .eq('id', id)  // note: your table uses 'id', not '_id'
    .select()
    .single();
  if (error) {
    console.error('Update announcement error:', error);
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

app.delete('/api/announcements/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', id);
  if (error) {
    console.error('Delete announcement error:', error);
    return res.status(500).json({ error: error.message });
  }
  res.json({ success: true });
});

// ===============================
// 🔑 FRONTEND ROUTES (unchanged)
// ===============================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

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
