<template>
  <div class="container mx-auto px-4 py-8 text-center">
    <p class="flex flex-col items-center justify-center gap-y-2 text-sm text-gray-600 sm:flex-row">
      <span class="inline-flex items-center">
        Made with
        <span class="mx-1 transform text-red-500 transition-transform duration-300 hover:scale-125">❤</span>
        for classical music
      </span>

      <span class="mx-2 hidden sm:inline" aria-hidden="true">|</span>

      <span class="inline-flex items-center">
        <a
          href="https://www.linkedin.com/company/classicalbot/"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center text-gray-600 hover:text-gray-900 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <svg aria-hidden="true" class="mr-1 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.32 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.1 20.45H3.54V9H7.1v11.45ZM22.23 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1.77-1.73V1.73C24 .77 23.21 0 22.23 0Z" />
          </svg>
          LinkedIn
        </a>
      </span>
    </p>
  </div>
</template>
