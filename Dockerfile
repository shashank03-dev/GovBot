# Use the official Microsoft Playwright image (Browsers are pre-installed!)
FROM mcr.microsoft.com/playwright/python:v1.58.0-jammy

# Set the working directory inside the container
WORKDIR /app

# Copy your requirements file first to leverage Docker caching
COPY requirements.txt .

# Install local OCR runtime for pytesseract.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

# Install your Python packages
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of your application code
COPY . .

# Expose the port Railway uses
EXPOSE 8080

# Start the FastAPI application
CMD ["uvicorn", "gov_agent.main:app", "--host", "0.0.0.0", "--port", "8080"]
