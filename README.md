# TrainWreck Backend

## Environment Variables for Railway.com

Configure these environment variables in your Railway project settings:

| Variable | Description | Example Value |
| :--- | :--- | :--- |
| `PORT` | The port the server will listen on (Railway provides this automatically) | `3001` |
| `FRONTEND_URL` | The URL of your frontend application to allow CORS | `https://your-frontend.railway.app` |
| `DATABASE_URL` | (If applicable) The connection string for your database | `postgresql://...` |

## Deployment Notes

- The build command is `npm run build`.
- The start command is `npm run start`.
- Ensure all necessary JSON and GeoJSON files are present in the root directory if they are not generated during the build process.
