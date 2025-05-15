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

  // Ensure the user is authenticated on the client side
  // We'll pass the Firebase Auth ID token from the client
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).send('Unauthorized: No token provided');
  }
  const idToken = authHeader.split('Bearer ')[1];

  try {
      // Verify the ID token to ensure the user is authenticated and get their claims
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const userEmail = decodedToken.email;

      // Define the allowed email addresses (must match the list in your rules and client-side)
      const allowedEmails = ["bigjaguar20112@gmail.com", "rachanon232010@gmail.com"]; // REPLACE with the actual emails

      // Check if the authenticated user's email is in the allowed list
      if (!allowedEmails.includes(userEmail)) {
          return res.status(403).send('Forbidden: User not authorized');
      }

      // Parse the request body (assuming JSON data from the client)
      const { name, description, price, imageUrl, imageFileBase64, imageFileName } = req.body;

      let finalImageUrl = '';

      if (imageFileBase64 && imageFileName) {
          // Handle image upload from base64 string
          const bucket = storage.bucket();
          const filePath = `product_images/${Date.now()}-${imageFileName}`;
          const file = bucket.file(filePath);

          // Convert base64 to buffer
          const imageBuffer = Buffer.from(imageFileBase64, 'base64');

          // Upload the buffer
          await file.save(imageBuffer, {
              metadata: {
                  contentType: 'image/jpeg' // You might need to infer content type based on file extension
              }
          });

          // Make the file publicly readable (adjust Storage rules for better security)
          await file.makePublic(); // NOTE: This makes the file publicly accessible via URL

          finalImageUrl = file.publicUrl(); // Get the public URL

      } else if (imageUrl) {
          // Use the provided image URL
          finalImageUrl = imageUrl;
      } else {
           return res.status(400).send('Bad Request: No image file or URL provided');
      }


      // Add the listing to Firestore
      await db.collection('products').add({
          name: name,
          description: description,
          price: price,
          imageUrl: finalImageUrl,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Send a success response
      res.status(200).send('Listing added successfully!');

  } catch (error) {
      console.error('Error adding listing:', error);
      res.status(500).send(`Error adding listing: ${error.message}`);
  }
};
