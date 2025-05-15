// This is a Vercel Serverless Function (Node.js environment)

// Import the Firebase Admin SDK
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if it hasn't been already
// We use environment variables to securely provide the service account credentials
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.PROJECT_ID, // From your Firebase Admin SDK JSON
        privateKeyId: process.env.PRIVATE_KEY_ID, // From your Firebase Admin SDK JSON
        privateKey: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'), // From your Firebase Admin SDK JSON (replace \n if needed)
        clientEmail: process.env.CLIENT_EMAIL, // From your Firebase Admin SDK JSON
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET // Your Storage Bucket name
    });
  } catch (error) {
    console.error('Firebase Admin initialization error', error);
    // It's crucial that Admin SDK initializes correctly for writing to Firebase
    // If this fails, the function won't work. Check Vercel Environment Variables.
  }
}

const db = admin.firestore();
const storage = admin.storage();

// This is the main handler for the serverless function
module.exports = async (req, res) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // --- REMOVED AUTHENTICATION AND AUTHORIZATION CHECKS ---
  // The following lines were removed:
  // const authHeader = req.headers.authorization;
  // if (!authHeader || !authHeader.startsWith('Bearer ')) { ... }
  // const idToken = authHeader.split('Bearer ')[1];
  // const decodedToken = await admin.auth().verifyIdToken(idToken);
  // const userEmail = decodedToken.email;
  // const allowedEmails = [...];
  // if (!allowedEmails.includes(userEmail)) { ... }
  // --- END REMOVED CHECKS ---


  try {
      // Parse the request body (assuming JSON data from the client)
      const { name, description, price, imageUrl, imageFileBase64, imageFileName } = req.body;

      let finalImageUrl = '';

      if (imageFileBase64 && imageFileName) {
          // Handle image upload from base64 string
          const bucket = storage.bucket();
          // Sanitize filename to prevent path traversal issues (basic example)
          const sanitizedFileName = imageFileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
          const filePath = `product_images/${Date.now()}-${sanitizedFileName}`;
          const file = bucket.file(filePath);

          // Convert base64 to buffer
          const imageBuffer = Buffer.from(imageFileBase64, 'base64');

          // Upload the buffer
          await file.save(imageBuffer, {
              metadata: {
                  // Try to infer content type from filename if possible, default to jpeg
                  contentType: file.name.endsWith('.png') ? 'image/png' : file.name.endsWith('.gif') ? 'image/gif' : 'image/jpeg'
              },
              // Add cache control headers for better performance
              predefinedAcl: 'publicRead' // Make the file publicly readable
          });

          // Get the download URL (might require Storage rules allowing unauthenticated reads)
          const downloadUrl = await file.getDownloadURL();
          finalImageUrl = downloadUrl;


      } else if (imageUrl) {
          // Use the provided image URL
          finalImageUrl = imageUrl;
      } else {
           console.error('Bad Request: No image file or URL provided');
           return res.status(400).send('Bad Request: No image file or URL provided');
      }

      // --- Write to Firestore (Admin SDK bypasses client-side rules) ---
      // The Admin SDK has elevated privileges and typically bypasses client-side rules.
      // Since we removed the user authentication check in this function, this write
      // will now proceed as long as the Admin SDK is initialized correctly.

      // Add the listing to Firestore
      await db.collection('products').add({
          name: name,
          description: description,
          price: price,
          imageUrl: finalImageUrl, // Use the final image URL
          createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Send a success response
      res.status(200).send('Listing added successfully!');

  } catch (error) {
      console.error('Error processing listing:', error);
      // Provide a more informative error based on the type
      // Removed auth-specific error handling
      res.status(500).send(`Error adding listing: ${error.message}`);
  }
};
