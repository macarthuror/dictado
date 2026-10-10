<script setup>
import { ref, onMounted, nextTick, watch } from 'vue'

const currentMode = ref('setup') // 'setup', 'study', 'summary'
const tableData = ref([])

const addRow = () => {
  tableData.value.push({ word: '', meaning: '' })
}

const removeRow = (index) => {
  tableData.value.splice(index, 1)
  if (tableData.value.length === 0) {
    addRow()
  }
}

const clearAll = () => {
  if (confirm('¿Estás seguro de que quieres borrar todas las palabras?')) {
    tableData.value = [
      { word: '', meaning: '' },
      { word: '', meaning: '' },
      { word: '', meaning: '' }
    ]
  }
}

const handlePaste = (e) => {
  const pasteData = (e.clipboardData || window.clipboardData).getData('text')
  if (!pasteData) return
  
  const rows = pasteData.split('\n').map(r => r.trim()).filter(r => r.length > 0)
  if (rows.length === 0) return

  if (rows.length > 1 || rows[0].includes('\t')) {
    e.preventDefault()
    
    const newRows = rows.map(r => {
      const parts = r.split('\t')
      return {
        word: parts[0] ? parts[0].trim() : '',
        meaning: parts.length > 1 ? parts[1].trim() : ''
      }
    })
    
    const filteredCurrent = tableData.value.filter(r => r.word || r.meaning)
    tableData.value = [...filteredCurrent, ...newRows]
    
    if (tableData.value.length === 0) {
      addRow()
    }
  }
}

const selectedLanguage = ref('es-ES')
const showWord = ref(false)
const speechRate = ref(1.0)
const studyList = ref([])
const currentIndex = ref(0)
const userAnswer = ref('')
const feedback = ref(null) // null, 'correct', 'incorrect'
const score = ref(0)
const errors = ref([]) // { expected, typed }
const isShaking = ref(false) // Animación de error
const inputRef = ref(null) // Referencia al input para enfocarlo

// --- NUEVA LÓGICA DE AUDIO (WEB AUDIO API Y NATIVO) ---
const audioEngine = ref('online') // 'online' (Web Audio API) o 'offline' (Nativo)
const enableReverb = ref(false)
const availableVoices = ref([])
const selectedVoiceURI = ref('')

let audioCtx = null
let biquadFilter = null
let convolver = null
let audioSource = null
let htmlAudioElement = null

const initWebAudio = async () => {
  if (audioCtx) return
  audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  
  htmlAudioElement = new Audio()
  htmlAudioElement.crossOrigin = "anonymous"
  
  audioSource = audioCtx.createMediaElementSource(htmlAudioElement)
  
  // Ecualizador para dar más claridad a la voz
  biquadFilter = audioCtx.createBiquadFilter()
  biquadFilter.type = 'highshelf'
  biquadFilter.frequency.value = 2000
  biquadFilter.gain.value = 3 // Pequeño realce de agudos
  
  // Efecto Reverb / Eco espacial
  convolver = audioCtx.createConvolver()
  const rate = audioCtx.sampleRate
  const length = rate * 1.5 // 1.5 segundos
  const impulse = audioCtx.createBuffer(2, length, rate)
  const left = impulse.getChannelData(0)
  const right = impulse.getChannelData(1)
  for (let i = 0; i < length; i++) {
    const decay = Math.exp(-3 * (i / rate))
    left[i] = (Math.random() * 2 - 1) * decay
    right[i] = (Math.random() * 2 - 1) * decay
  }
  convolver.buffer = impulse

  audioSource.connect(biquadFilter)
}

const loadVoices = () => {
  const langPrefix = selectedLanguage.value.split('-')[0]
  availableVoices.value = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith(langPrefix))
  
  if (availableVoices.value.length > 0) {
    // Si no hay voz seleccionada o la actual no es del idioma correcto
    if (!selectedVoiceURI.value || !availableVoices.value.find(v => v.voiceURI === selectedVoiceURI.value)) {
      selectedVoiceURI.value = availableVoices.value[0].voiceURI
    }
  }
}

watch(selectedLanguage, () => {
  loadVoices()
})

const playAudio = async (text) => {
  if (audioEngine.value === 'online') {
    try {
      if (!audioCtx) await initWebAudio()
      if (audioCtx.state === 'suspended') await audioCtx.resume()
      
      biquadFilter.disconnect()
      
      if (enableReverb.value) {
        biquadFilter.connect(convolver)
        convolver.connect(audioCtx.destination)
      } else {
        biquadFilter.connect(audioCtx.destination)
      }
      
      const lang = selectedLanguage.value.split('-')[0]
      const gUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(text)}`
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(gUrl)}`
      
      htmlAudioElement.src = proxyUrl
      htmlAudioElement.preservesPitch = true
      htmlAudioElement.playbackRate = parseFloat(speechRate.value)
      
      await htmlAudioElement.play()
    } catch (e) {
      console.error("Error reproduciendo Web Audio, usando nativo:", e)
      playNativeTTS(text)
    }
  } else {
    playNativeTTS(text)
  }
}

const playNativeTTS = (text) => {
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = selectedLanguage.value
  utterance.rate = parseFloat(speechRate.value) // Asegurarse de que sea Float
  
  if (selectedVoiceURI.value) {
    const voice = availableVoices.value.find(v => v.voiceURI === selectedVoiceURI.value)
    if (voice) utterance.voice = voice
  }
  
  window.speechSynthesis.speak(utterance)
}

onMounted(() => {
  const savedWords = localStorage.getItem('dictado_words')
  if (savedWords) {
    try {
      const parsed = JSON.parse(savedWords)
      if (Array.isArray(parsed)) {
        tableData.value = parsed
      }
    } catch (e) {
      tableData.value = savedWords.split('\n').map(w => w.trim()).filter(w => w.length > 0).map(w => {
        const parts = w.split('\t')
        return {
          word: parts[0].trim(),
          meaning: parts.length > 1 ? parts[1].trim() : ''
        }
      })
    }
  }
  
  if (tableData.value.length === 0) {
    tableData.value.push({ word: '', meaning: '' }, { word: '', meaning: '' }, { word: '', meaning: '' })
  }
  
  const savedLang = localStorage.getItem('dictado_lang')
  if (savedLang) selectedLanguage.value = savedLang

  const savedShow = localStorage.getItem('dictado_show_word')
  if (savedShow !== null) showWord.value = savedShow === 'true'

  const savedSpeed = localStorage.getItem('dictado_speed')
  if (savedSpeed !== null) speechRate.value = parseFloat(savedSpeed)

  // Cargar estado de audio
  const savedEngine = localStorage.getItem('dictado_engine')
  if (savedEngine) audioEngine.value = savedEngine
  
  const savedReverb = localStorage.getItem('dictado_reverb')
  if (savedReverb !== null) enableReverb.value = savedReverb === 'true'
  
  const savedVoice = localStorage.getItem('dictado_voice')
  if (savedVoice) selectedVoiceURI.value = savedVoice

  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = loadVoices
    // Intento inicial (algunos navegadores las tienen de inmediato)
    loadVoices()
  }
})

// --- Auto-Save Watchers ---
watch(tableData, (newVal) => {
  const validRows = newVal.filter(r => r.word.trim().length > 0)
  localStorage.setItem('dictado_words', JSON.stringify(validRows))
}, { deep: true })

watch(selectedLanguage, (newVal) => localStorage.setItem('dictado_lang', newVal))
watch(showWord, (newVal) => localStorage.setItem('dictado_show_word', newVal))
watch(speechRate, (newVal) => localStorage.setItem('dictado_speed', newVal))
watch(audioEngine, (newVal) => localStorage.setItem('dictado_engine', newVal))
watch(enableReverb, (newVal) => localStorage.setItem('dictado_reverb', newVal))
watch(selectedVoiceURI, (newVal) => localStorage.setItem('dictado_voice', newVal))

const testVoice = () => {
  const firstValidRow = tableData.value.find(r => r.word.trim().length > 0)
  const textToSpeak = firstValidRow 
    ? firstValidRow.word 
    : (selectedLanguage.value === 'ja-JP' ? 'テスト' : 'Prueba')

  playAudio(textToSpeak)
}

const startStudy = () => {
  const validRows = tableData.value.filter(r => r.word.trim().length > 0)
  if (validRows.length === 0) return

  // Shuffle array
  studyList.value = validRows.map(r => ({ ...r, word: r.word.trim(), meaning: r.meaning.trim() })).sort(() => Math.random() - 0.5)
  
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
  const item = studyList.value[currentIndex.value]
  if (item) {
    playAudio(item.word)
  }
}

const checkAnswer = () => {
  if (feedback.value !== null) return // already checked
  
  const currentItem = studyList.value[currentIndex.value]
  const expectedWord = currentItem.word
  const typed = userAnswer.value.trim()

  if (typed.toLowerCase() === expectedWord.toLowerCase()) {
    feedback.value = 'correct'
    score.value++
  } else {
    feedback.value = 'incorrect'
    errors.value.push({ expected: expectedWord, meaning: currentItem.meaning, typed: typed || '(vacío)' })
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
        
        <div class="table-editor" @paste="handlePaste">
          <table>
            <thead>
              <tr>
                <th>Palabra</th>
                <th>Significado (Opcional)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in tableData" :key="index">
                <td><input type="text" v-model="row.word" placeholder="Ej: apple" /></td>
                <td><input type="text" v-model="row.meaning" placeholder="Ej: manzana" /></td>
                <td style="width: 40px; text-align: center;">
                  <button class="icon-btn danger-icon" @click="removeRow(index)" title="Eliminar fila">🗑️</button>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="table-actions">
            <button class="secondary add-row-btn" @click="addRow">+ Añadir fila</button>
            <button class="danger clear-all-btn" @click="clearAll">Borrar todo</button>
          </div>
        </div>

        <div class="form-group">
          <label>Idioma:</label>
          <select v-model="selectedLanguage">
            <option value="es-ES">Español</option>
            <option value="ja-JP">Japonés</option>
          </select>
        </div>

        <div class="form-group audio-settings">
          <label>Motor de Audio:</label>
          <div style="display: flex; gap: 1rem; margin-top: 0.5rem; flex-direction: column;">
            <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: normal;">
              <input type="radio" v-model="audioEngine" value="online" />
              Online (Web Audio API - Más natural y preserva tono)
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: normal;">
              <input type="radio" v-model="audioEngine" value="offline" />
              Nativo del Navegador
            </label>
          </div>
        </div>

        <div v-if="audioEngine === 'online'" class="checkbox-container form-group">
          <label>
            <input type="checkbox" v-model="enableReverb" />
            Activar Eco (Reverb Espacial)
          </label>
        </div>

        <div v-if="audioEngine === 'offline' && availableVoices.length > 0" class="form-group">
          <label>Voz del Navegador:</label>
          <select v-model="selectedVoiceURI">
            <option v-for="voice in availableVoices" :key="voice.voiceURI" :value="voice.voiceURI">
              {{ voice.name }}
            </option>
          </select>
        </div>

        <div class="checkbox-container form-group">
          <label>
            <input type="checkbox" v-model="showWord" />
            Mostrar palabra durante el dictado
          </label>
        </div>

        <div class="form-group">
          <div class="label-with-action">
            <label>Velocidad de voz: {{ speechRate }}x</label>
            <button class="icon-btn small-btn" @click="testVoice" title="Probar voz">🔊</button>
          </div>
          <input type="range" v-model.number="speechRate" min="0.5" max="2.0" step="0.1" class="slider" />
        </div>

        <button @click="startStudy">Iniciar Dictado</button>
        
        <section class="instructions-section">
          <div class="instructions-content">
            <h2>¿Cómo usar nuestra App de Dictado Online?</h2>
            <p>
              Nuestra <strong>App de Dictado</strong> está diseñada para ayudarte a mejorar tu ortografía y comprensión auditiva. Sigue estos pasos para comenzar tu <em>spelling practice</em>:
            </p>
            <ol>
              <li><strong>Ingresa tus palabras:</strong> Escribe una palabra por línea en el área de texto.</li>
              <li><strong>Selecciona el idioma:</strong> Elige el idioma que deseas practicar.</li>
              <li><strong>Ajusta la velocidad:</strong> Modifica la velocidad de la voz según tu nivel. (Usa Online TTS para mantener el tono).</li>
              <li><strong>¡Inicia el dictado online!</strong> Escucha atentamente y escribe lo que oyes. Al final, obtendrás un resumen de tus resultados.</li>
            </ol>
          </div>
        </section>
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
          <div :key="currentIndex" v-if="showWord" class="target-word">
            {{ studyList[currentIndex].word }}
            <div v-if="studyList[currentIndex].meaning" class="target-meaning">
              {{ studyList[currentIndex].meaning }}
            </div>
          </div>
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
            <div v-if="studyList[currentIndex].meaning" class="feedback-meaning">
              Significado: {{ studyList[currentIndex].meaning }}
            </div>
          </div>
          <div v-else-if="feedback === 'incorrect' && !showWord" class="feedback-alert incorrect">
            ❌ Incorrecto. Era: <strong>{{ studyList[currentIndex].word }}</strong>
            <div v-if="studyList[currentIndex].meaning" class="feedback-meaning">
              Significado: {{ studyList[currentIndex].meaning }}
            </div>
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
              <strong>Correcto:</strong> {{ err.expected }}
              <span v-if="err.meaning"> ({{ err.meaning }})</span><br>
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
