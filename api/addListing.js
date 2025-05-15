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
    // It's crucial that Admin SDK initializes correctly for auth verification
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

  // Ensure the user is authenticated on the client side
  // We'll pass the Firebase Auth ID token from the client
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('Unauthorized: No token provided or invalid format');
      return res.status(401).send('Unauthorized: No token provided or invalid format');
  }
  const idToken = authHeader.split('Bearer ')[1];

  try {
      // Verify the ID token to ensure the user is authenticated and get their claims
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const userEmail = decodedToken.email;

      // Define the two allowed email addresses
      // *** DOUBLE-CHECK THESE EMAIL ADDRESSES CAREFULLY IN THIS FILE ***
      const allowedEmails = ["bigjaguar20112@gmail.com", "rachanon232010@gmail.com"]; // REPLACE with the actual emails

      // Check if the authenticated user's email is in the allowed list
      if (!allowedEmails.includes(userEmail)) {
          console.error(`Forbidden: User ${userEmail} not authorized`);
          return res.status(403).send('Forbidden: User not authorized');
      }

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

          // The public URL format might vary slightly, using getDownloadURL is safer
          // If using predefinedAcl: 'publicRead', the direct URL works, but getDownloadURL is Firebase's standard way.
          // Note: getDownloadURL might require a token unless rules allow unauthenticated reads.
          // If you used `makePublic()` before, getDownloadURL should work without auth.
          // Let's stick to getDownloadURL as it's more robust with varying Storage rules.
          // await file.makePublic(); // If predefinedAcl: 'publicRead' is used, this might be redundant but harmless.

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

      // --- Check Firestore Write Permissions (Admin SDK bypasses rules, but check logic) ---
      // The Admin SDK writes to Firestore as a privileged user, bypassing client-side rules.
      // The authorization check (email in allowedEmails) happens *before* this point in the function.
      // So, if you reach here, the user is authorized *by the serverless function's logic*.
      // The Firestore rule 'allow write: if request.auth != null;' or similar might still be needed
      // if the Admin SDK somehow uses the end-user's auth context, but typically it doesn't.
      // The rule 'allow write: if request.auth.token.email in allowedEmails' is for client-side writes.
      // With Admin SDK, you primarily rely on the function's internal check.

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
      if (error.code === 'auth/argument-error' || error.message.includes('Firebase ID token has invalid signature')) {
           res.status(401).send('Unauthorized: Invalid authentication token.');
      } else if (error.message.includes('Forbidden')) { // Check for our custom forbidden message
           res.status(403).send(error.message);
      }
      else {
         res.status(500).send(`Error adding listing: ${error.message}`);
      }
  }
};
