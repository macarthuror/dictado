<script setup>
import { ref, onMounted, nextTick } from 'vue'

const currentMode = ref('setup') // 'setup', 'study', 'summary'
const wordsInput = ref('')
const selectedLanguage = ref('es-ES')
const showWord = ref(false)
const speechRate = ref(1.0) // UX: velocidad de la voz
const studyList = ref([])
const currentIndex = ref(0)
const userAnswer = ref('')
const feedback = ref(null) // null, 'correct', 'incorrect'
const score = ref(0)
const errors = ref([]) // { expected, typed }
const isShaking = ref(false) // Animación de error
const inputRef = ref(null) // Referencia al input para enfocarlo

onMounted(() => {
  const savedWords = localStorage.getItem('dictado_words')
  if (savedWords) wordsInput.value = savedWords
  
  const savedLang = localStorage.getItem('dictado_lang')
  if (savedLang) selectedLanguage.value = savedLang

  const savedShow = localStorage.getItem('dictado_show_word')
  if (savedShow !== null) showWord.value = savedShow === 'true'

  const savedSpeed = localStorage.getItem('dictado_speed')
  if (savedSpeed !== null) speechRate.value = parseFloat(savedSpeed)
})

const startStudy = () => {
  if (!wordsInput.value.trim()) return

  // Save to localStorage
  localStorage.setItem('dictado_words', wordsInput.value)
  localStorage.setItem('dictado_lang', selectedLanguage.value)
  localStorage.setItem('dictado_show_word', showWord.value)
  localStorage.setItem('dictado_speed', speechRate.value)

  // Parse words
  const words = wordsInput.value
    .split('\n')
    .map(w => w.trim())
    .filter(w => w.length > 0)
  
  if (words.length === 0) return

  // Shuffle array
  studyList.value = words.sort(() => Math.random() - 0.5)
  
  // Reset state
  currentIndex.value = 0
  score.value = 0
  errors.value = []
  userAnswer.value = ''
  feedback.value = null
  
  currentMode.value = 'study'
  
  // Start first word
  nextTick(() => {
    speakWord()
    if (inputRef.value) inputRef.value.focus()
  })
}

const speakWord = () => {
  const text = studyList.value[currentIndex.value]
  if (!text) return

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = selectedLanguage.value
  utterance.rate = speechRate.value
  window.speechSynthesis.speak(utterance)
}

const checkAnswer = () => {
  if (feedback.value !== null) return // already checked
  
  const expected = studyList.value[currentIndex.value]
  const typed = userAnswer.value.trim()

  if (typed.toLowerCase() === expected.toLowerCase()) {
    feedback.value = 'correct'
    score.value++
  } else {
    feedback.value = 'incorrect'
    errors.value.push({ expected, typed: typed || '(vacío)' })
    triggerShake()
  }
}

const triggerShake = () => {
  isShaking.value = true
  setTimeout(() => {
    isShaking.value = false
  }, 500)
}

const nextWord = () => {
  currentIndex.value++
  userAnswer.value = ''
  feedback.value = null

  if (currentIndex.value >= studyList.value.length) {
    currentMode.value = 'summary'
  } else {
    speakWord()
    nextTick(() => {
      if (inputRef.value) inputRef.value.focus()
    })
  }
}

const reset = () => {
  currentMode.value = 'setup'
}
</script>

<template>
  <div class="container">
    <Transition name="fade" mode="out-in">
      
      <!-- MODO CONFIGURACIÓN -->
      <div v-if="currentMode === 'setup'" key="setup">
        <h1>App de Dictado</h1>
        
        <div class="form-group">
          <label>Palabras (una por línea):</label>
          <textarea 
            v-model="wordsInput" 
            placeholder="Ejemplo:&#10;manzana&#10;perro&#10;casa"
          ></textarea>
        </div>

        <div class="form-group">
          <label>Idioma:</label>
          <select v-model="selectedLanguage">
            <option value="es-ES">Español</option>
            <option value="ja-JP">Japonés</option>
          </select>
        </div>

        <div class="checkbox-container form-group">
          <label>
            <input type="checkbox" v-model="showWord" />
            Mostrar palabra durante el dictado
          </label>
        </div>

        <div class="form-group">
          <label>Velocidad de voz: {{ speechRate }}x</label>
          <input type="range" v-model="speechRate" min="0.5" max="2.0" step="0.1" class="slider" />
        </div>

        <button @click="startStudy">Iniciar Dictado</button>
      </div>

      <!-- MODO ESTUDIO -->
      <div v-else-if="currentMode === 'study'" key="study" class="study-wrapper">
        
        <div class="progress-section">
          <h1 class="progress-title">Palabra {{ currentIndex + 1 }} de {{ studyList.length }}</h1>
          <div class="progress-container">
            <div class="progress-bar" :style="{ width: `${((currentIndex) / studyList.length) * 100}%` }"></div>
          </div>
        </div>
        
        <Transition name="fade" mode="out-in">
          <h2 :key="currentIndex" v-if="showWord" class="target-word">{{ studyList[currentIndex] }}</h2>
        </Transition>

        <div v-if="!showWord" :class="{ 'shake': isShaking }" class="input-wrapper">
          <input 
            type="text" 
            ref="inputRef"
            v-model="userAnswer" 
            @keyup.enter="feedback === null ? checkAnswer() : nextWord()"
            placeholder="Escribe lo que escuchaste..."
            :disabled="feedback !== null"
          />
        </div>

        <!-- Feedback UI -->
        <Transition name="fade" mode="out-in">
          <div v-if="feedback === 'correct' && !showWord" class="feedback-alert correct">
            ✅ ¡Correcto!
          </div>
          <div v-else-if="feedback === 'incorrect' && !showWord" class="feedback-alert incorrect">
            ❌ Incorrecto. Era: <strong>{{ studyList[currentIndex] }}</strong>
          </div>
          <div v-else-if="!showWord" class="feedback-alert placeholder">
            <!-- invisible placeholder to prevent layout jump -->
          </div>
        </Transition>

        <div class="button-group">
          <button v-if="feedback === null && !showWord" @click="checkAnswer">Comprobar</button>
          <button v-if="feedback !== null || showWord" @click="nextWord">Siguiente</button>
          <button class="secondary" @click="speakWord" :disabled="feedback === 'correct' && !showWord">Repetir Audio</button>
        </div>

        <div style="margin-top: 2rem;">
          <button class="danger" @click="reset">Volver al inicio</button>
        </div>
      </div>

      <!-- MODO RESUMEN -->
      <div v-else-if="currentMode === 'summary'" key="summary">
        <h1>Resumen</h1>
        
        <template v-if="!showWord">
          <h2>Puntuación: {{ score }} / {{ studyList.length }}</h2>

          <div v-if="errors.length > 0" class="error-list">
            <h3>Errores:</h3>
            <div v-for="(err, index) in errors" :key="index" class="error-item">
              <strong>Correcto:</strong> {{ err.expected }}<br>
              <strong>Escribiste:</strong> {{ err.typed }}
            </div>
          </div>
          <div v-else>
            <h3 style="color: #4CAF50;">🎉 ¡Perfección! No tuviste errores.</h3>
          </div>
        </template>
        <template v-else>
          <h2 style="color: #4CAF50;">🎉 ¡Repaso completado!</h2>
          <p>Has escuchado y leído {{ studyList.length }} palabras.</p>
        </template>

        <button @click="reset" style="margin-top: 1.5rem;">Volver a empezar</button>
      </div>

    </Transition>
  </div>
</template>
