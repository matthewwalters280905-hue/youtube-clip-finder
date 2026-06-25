# YouTube Clip Finder

This is a Netlify-ready site for gathering YouTube clips from a prompt.

## Deploy

This app uses a Netlify Function so the YouTube API key stays private.

The recommended deployment path is:

1. Put this folder in a GitHub repository.
2. Connect the repository to Netlify.
3. In Netlify, add an environment variable named `YOUTUBE_API_KEY`.
4. Redeploy the site after adding the key.

You can also deploy with the Netlify CLI. A simple drag-and-drop deploy is fine for static sites, but it may not deploy the serverless function this app needs for the YouTube API call.

## YouTube API setup

Create an API key in Google Cloud with the YouTube Data API v3 enabled. The app uses:

- `search.list` to find embeddable videos from the prompt.
- `videos.list` to add duration, view counts, and richer metadata.

The API key is only used in the Netlify Function and is not exposed in browser code.
