import os
import io
import base64
import numpy as np
import cv2
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from tensorflow.keras.models import load_model

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load model using the absolute path to the parent directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, 'best_mask_detector.h5')

try:
    print(f"Loading model from: {MODEL_PATH}")
    model = load_model(MODEL_PATH)
    print("Model loaded successfully!")
except Exception as e:
    model = None
    print(f"Error loading model: {e}")

class ImageData(BaseModel):
    image_base64: str

@app.get("/")
def read_root():
    return {"status": "Model loaded" if model else "Model not loaded", "model_path": MODEL_PATH}

@app.post("/predict")
async def predict(data: ImageData):
    if model is None:
        raise HTTPException(status_code=500, detail="Model not loaded on the server")
    
    try:
        # Decode the base64 string
        image_data = data.image_base64
        if "base64," in image_data:
            image_data = image_data.split("base64,")[1]
            
        decoded_data = base64.b64decode(image_data)
        
        # Convert to numpy array
        nparr = np.frombuffer(decoded_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="Could not decode image")
            
        # OpenCV uses BGR by default, but ImageDataGenerator uses RGB
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        # Preprocessing matching the notebook
        img_resized = cv2.resize(img, (128, 128))
        img_rescaled = img_resized / 255.0
        
        # Expand dimensions to match batch size (1, 128, 128, 3)
        img_input = np.expand_dims(img_rescaled, axis=0)
        
        # Predict
        prediction = model.predict(img_input, verbose=0)
        score = float(prediction[0][0])
        
        # Class 0: with_mask, Class 1: without_mask
        label = "with_mask" if score < 0.5 else "without_mask"
        confidence = (1.0 - score) if score < 0.5 else score
        
        return {
            "prediction": label,
            "confidence": confidence,
            "raw_score": score
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
