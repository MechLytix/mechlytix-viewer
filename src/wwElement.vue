<template>
  <div 
    class="mechlytix-viewer"
    :class="{ 'is-drag-over': isDragging, 'is-loading': isLoading }"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div v-if="isLoading" class="overlay loading">
      <div class="spinner"></div>
      <p>Analyzing Geometry...</p>
    </div>

    <div v-else-if="isDragging" class="overlay dragging">
      <p>Drop to Analyze</p>
    </div>

    <div v-else-if="!myGeometry" class="overlay empty">
      <p>Drag & Drop STL or STEP File</p>
    </div>

    <!-- UI CONTROLS -->
    <div class="ui-controls" v-if="myGeometry">
      <button @click="resetCamera" class="btn-reset">↺ Reset View</button>
      
      <div class="dimensions-panel" v-if="dimensions">
        <h4>Dimensions</h4>
        <div class="dim-row"><span>X:</span> {{ dimensions[0].toFixed(2) }}</div>
        <div class="dim-row"><span>Y:</span> {{ dimensions[1].toFixed(2) }}</div>
        <div class="dim-row"><span>Z:</span> {{ dimensions[2].toFixed(2) }}</div>
      </div>
    </div>

    <TresCanvas clear-color="#1E1E1E" style="width: 100%; height: 100%;">
      <TresPerspectiveCamera ref="cameraRef" :position="[10, 10, 10]" :look-at="[0, 0, 0]" />
      <OrbitControls />
      <TresAmbientLight :intensity="1" />
      <TresDirectionalLight :position="[10, 10, 10]" :intensity="2" />

      <TresMesh v-if="myGeometry" :geometry="myGeometry">
        <TresMeshStandardMaterial vertexColors />
      </TresMesh>

      <TresGridHelper :args="[20, 20, 0x444444, 0x333333]" />
      <TresAxesHelper :args="[5]" />

    </TresCanvas>
  </div>
</template>

<script setup>
import { ref, watch, shallowRef } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import * as THREE from 'three'

const props = defineProps({
  content: { type: Object, required: true },
})

const myGeometry = shallowRef(null)
const isDragging = ref(false)
const isLoading = ref(false)
const dimensions = ref(null)
const cameraRef = shallowRef(null)

const resetCamera = () => {
  if (!cameraRef.value) return

  const startPos = cameraRef.value.position.clone()
  const targetPos = new THREE.Vector3(10, 10, 10)
  const startTime = performance.now()
  const duration = 1000 // 1 second

  const animate = (currentTime) => {
    const elapsed = currentTime - startTime
    const progress = Math.min(elapsed / duration, 1)
    
    // Ease out cubic function for smooth feel
    const ease = 1 - Math.pow(1 - progress, 3)

    cameraRef.value.position.lerpVectors(startPos, targetPos, ease)
    cameraRef.value.lookAt(0, 0, 0)

    if (progress < 1) {
      requestAnimationFrame(animate)
    }
  }
  
  requestAnimationFrame(animate)
}

// ⚠️ YOUR API URL (Confirm this matches your Google Cloud URL)
const API_URL = "https://mechlytix-api-815993640334.europe-west2.run.app/analyze" 

// --- API & COLORING LOGIC ---
const analyzeAndColor = async (file, localGeometry) => {
  isLoading.value = true
  
  try {
    const formData = new FormData()
    formData.append('file', file)

    // 1. Send file to Python API
    const response = await fetch(API_URL, {
      method: 'POST',
      body: formData
    })
    
    if (!response.ok) throw new Error("API Request Failed")
    
    const result = await response.json()
    console.log("Analysis Result:", result)
    
    if (result.dimensions) {
      dimensions.value = result.dimensions
    }

    // 2. Determine Geometry (Local STL or Backend GLB)
    let geometry = localGeometry

    if (result.glb_base64) {
      // Decode Base64 to ArrayBuffer
      const binaryString = atob(result.glb_base64)
      const len = binaryString.length
      const bytes = new Uint8Array(len)
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      // Load GLB
      const loader = new GLTFLoader()
      const gltf = await loader.parseAsync(bytes.buffer, '')
      
      // Find the first mesh in the GLTF scene
      gltf.scene.traverse((child) => {
        if (child.isMesh && !geometry) {
          geometry = child.geometry
        }
      })
    }

    if (!geometry) throw new Error("No geometry found to render")

    // 3. Paint Geometry
    const count = geometry.attributes.position.count
    const colors = new Float32Array(count * 3) 
    
    // Default Color: Grey (0.5, 0.5, 0.5)
    for (let i = 0; i < count * 3; i++) {
      colors[i] = 0.5 
    }

    // Error Color: Orange (1.0, 0.4, 0.0)
    const badFaces = result.bad_face_indices || []
    
    badFaces.forEach(faceIndex => {
      // Each face is a triangle with 3 vertices (A, B, C)
      const vA = faceIndex * 3
      const vB = faceIndex * 3 + 1
      const vC = faceIndex * 3 + 2

      // Check bounds to avoid crashes if backend mesh differs slightly
      if (vC * 3 + 2 < colors.length) {
        // Paint Vertex A
        colors[vA * 3] = 1.0; colors[vA * 3 + 1] = 0.4; colors[vA * 3 + 2] = 0.0;
        // Paint Vertex B
        colors[vB * 3] = 1.0; colors[vB * 3 + 1] = 0.4; colors[vB * 3 + 2] = 0.0;
        // Paint Vertex C
        colors[vC * 3] = 1.0; colors[vC * 3 + 1] = 0.4; colors[vC * 3 + 2] = 0.0;
      }
    })

    // Apply colors to mesh
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.center()
    geometry.computeVertexNormals()

    // --- AUTO-SCALE TO FIT VIEWER ---
    geometry.computeBoundingBox()
    const maxDim = Math.max(
      geometry.boundingBox.max.x - geometry.boundingBox.min.x,
      geometry.boundingBox.max.y - geometry.boundingBox.min.y,
      geometry.boundingBox.max.z - geometry.boundingBox.min.z
    )
    
    if (maxDim > 0) {
      const scaleFactor = 10 / maxDim // Target size: 10 units
      geometry.scale(scaleFactor, scaleFactor, scaleFactor)
    }

    // --- ALIGN TO GRID (SIT ON TOP) ---
    // Re-compute bounding box after scaling
    geometry.computeBoundingBox()
    // Move up by the distance from the bottom (min.y) to 0
    geometry.translate(0, -geometry.boundingBox.min.y, 0)
    
    // Update the reactive variable to trigger render
    myGeometry.value = geometry

  } catch (error) {
    console.error("API Error:", error)
    alert("Analysis failed. Check console for details.")
  } finally {
    isLoading.value = false
  }
}

// --- DRAG EVENTS ---
const onDragOver = () => { isDragging.value = true }
const onDragLeave = () => { isDragging.value = false }

const onDrop = (event) => {
  isDragging.value = false
  const file = event.dataTransfer?.files[0]
  
  if (!file) return

  const filename = file.name.toLowerCase()

  if (filename.endsWith('.stl')) {
    // 1. Read file locally to display it (Fast Preview)
    const reader = new FileReader()
    reader.onload = (e) => {
      const loader = new STLLoader()
      const geometry = loader.parse(e.target.result)
      
      // 2. Send original file to API for analysis
      analyzeAndColor(file, geometry)
    }
    reader.readAsArrayBuffer(file)
  } else if (filename.endsWith('.step') || filename.endsWith('.stp')) {
    // 1. STEP files cannot be previewed locally easily.
    // Send directly to API and wait for GLB response.
    analyzeAndColor(file, null)
  } else {
    alert("Please drop an .STL or .STEP file")
  }
}
</script>

<style lang="scss" scoped>
.mechlytix-viewer {
  width: 100%; height: 100%; min-height: 400px;
  overflow: hidden; position: relative;
  background: #1E1E1E;
  border-radius: 8px;
  /* Removed border to look cleaner */
}

/* OVERLAYS */
.overlay {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  z-index: 10; pointer-events: none;
  color: #E0E0E0; background: rgba(30,30,30,0.8);
}

.overlay.empty { background: transparent; pointer-events: none; }
.overlay.empty p { font-size: 18px; font-weight: 600; opacity: 0.5; }

.overlay.dragging {
  background-color: rgba(255, 102, 0, 0.1);
  border: 4px dashed #FF6600;
}
.overlay.dragging p { color: #FF6600; font-size: 24px; font-weight: bold; }

/* LOADING SPINNER */
.spinner {
  width: 40px; height: 40px; border: 4px solid #333; border-top: 4px solid #FF6600;
  border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 10px;
}
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

/* UI CONTROLS */
.ui-controls {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  pointer-events: none; /* Let clicks pass through to canvas */
  z-index: 15;
}

.btn-reset {
  position: absolute; top: 10px; right: 10px;
  background: rgba(30, 30, 30, 0.8); color: white;
  border: 1px solid #444; border-radius: 4px;
  padding: 6px 12px; cursor: pointer; pointer-events: auto;
  font-size: 12px; transition: background 0.2s;
}
.btn-reset:hover { background: #FF6600; border-color: #FF6600; }

.dimensions-panel {
  position: absolute; bottom: 10px; left: 10px;
  background: rgba(30, 30, 30, 0.9); color: #E0E0E0;
  padding: 10px; border-radius: 6px; border: 1px solid #444;
  font-size: 12px; pointer-events: auto;
  min-width: 120px;
}
.dimensions-panel h4 { margin: 0 0 5px 0; color: #FF6600; font-size: 11px; text-transform: uppercase; }
.dim-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
.dim-row span { color: #888; margin-right: 8px; }
</style>