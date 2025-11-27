<template>
  <div 
    class="mechlytix-viewer"
    :class="{ 'is-drag-over': isDragging, 'is-loading': isLoading }"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div class="selection-handle">⚙️ Select Viewer</div>

    <div v-if="isLoading" class="overlay loading">
      <div class="spinner"></div>
      <p>Analyzing Geometry...</p>
    </div>

    <div v-else-if="isDragging" class="overlay dragging">
      <p>Drop to Analyze</p>
    </div>

    <div v-else-if="!myGeometry" class="overlay empty">
      <p>Drag & Drop STL File</p>
    </div>

    <TresCanvas clear-color="#1E1E1E" window-size>
      <TresPerspectiveCamera :position="[10, 10, 10]" :look-at="[0, 0, 0]" />
      <OrbitControls />
      <TresAmbientLight :intensity="1" />
      <TresDirectionalLight :position="[10, 10, 10]" :intensity="2" />

      <TresMesh v-if="myGeometry" :geometry="myGeometry">
        <TresMeshStandardMaterial vertexColors />
      </TresMesh>

      <TresGridHelper v-else :args="[20, 20, 0x444444, 0x333333]" />

    </TresCanvas>
  </div>
</template>

<script setup>
import { ref, watch, shallowRef } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader'
import * as THREE from 'three'

const props = defineProps({
  content: { type: Object, required: true },
})

const myGeometry = shallowRef(null)
const isDragging = ref(false)
const isLoading = ref(false)

// ⚠️ ENSURE THIS MATCHES YOUR GOOGLE CLOUD URL
const API_URL = "https://mechlytix-api-815993640334.europe-west2.run.app/analyze" 

// --- API & COLORING LOGIC ---
const analyzeAndColor = async (file, geometry) => {
  isLoading.value = true
  
  try {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(API_URL, {
      method: 'POST',
      body: formData
    })
    const result = await response.json()
    
    console.log("Analysis Result:", result)

    // Paint Logic: Default Grey, Bad Faces Orange
    const count = geometry.attributes.position.count
    const colors = new Float32Array(count * 3) 
    
    for (let i = 0; i < count * 3; i++) {
      colors[i] = 0.5 // Default Grey
    }

    const badFaces = result.bad_face_indices || []
    
    badFaces.forEach(faceIndex => {
      const vA = faceIndex * 3
      const vB = faceIndex * 3 + 1
      const vC = faceIndex * 3 + 2

      // RGB for Orange (1.0, 0.4, 0.0)
      colors[vA * 3] = 1.0; colors[vA * 3 + 1] = 0.4; colors[vA * 3 + 2] = 0.0;
      colors[vB * 3] = 1.0; colors[vB * 3 + 1] = 0.4; colors[vB * 3 + 2] = 0.0;
      colors[vC * 3] = 1.0; colors[vC * 3 + 1] = 0.4; colors[vC * 3 + 2] = 0.0;
    })

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.center()
    geometry.computeVertexNormals()
    myGeometry.value = geometry

  } catch (error) {
    console.error("API Error:", error)
    alert("Analysis failed.")
  } finally {
    isLoading.value = false
  }
}

const onDragOver = () => { isDragging.value = true }
const onDragLeave = () => { isDragging.value = false }

const onDrop = (event) => {
  isDragging.value = false
  const file = event.dataTransfer?.files[0]
  if (file && file.name.toLowerCase().endsWith('.stl')) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const loader = new STLLoader()
      const geometry = loader.parse(e.target.result)
      analyzeAndColor(file, geometry)
    }
    reader.readAsArrayBuffer(file)
  }
}
</script>

<style lang="scss" scoped>
.mechlytix-viewer {
  width: 100%; height: 100%; min-height: 400px;
  overflow: hidden; position: relative;
  border-radius: 8px;
}
.overlay {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  z-index: 10; pointer-events: none;
  color: #E0E0E0; background: rgba(30,30,30,0.8);
}
.spinner {
  width: 40px; height: 40px; border: 4px solid #333; border-top: 4px solid #FF6600;
  border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 10px;
}
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
.selection-handle {
  position: absolute; top: 0; right: 0; background-color: #FF6600;
  color: white; padding: 4px 8px; font-size: 10px; cursor: pointer; z-index: 20;
  pointer-events: auto;
}
</style>