<script setup>
import { ref, onMounted, nextTick } from 'vue'

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
})

const startStudy = () => {
  const validRows = tableData.value.filter(r => r.word.trim().length > 0)
  if (validRows.length === 0) return

  // Save to localStorage
  localStorage.setItem('dictado_words', JSON.stringify(validRows))
  localStorage.setItem('dictado_lang', selectedLanguage.value)
  localStorage.setItem('dictado_show_word', showWord.value)
  localStorage.setItem('dictado_speed', speechRate.value)

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
  if (!item) return

  const utterance = new SpeechSynthesisUtterance(item.word)
  utterance.lang = selectedLanguage.value
  utterance.rate = speechRate.value
  window.speechSynthesis.speak(utterance)
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
        
        <section class="instructions-section">
          <div class="instructions-content">
            <h2>¿Cómo usar nuestra App de Dictado Online?</h2>
            <p>
              Nuestra <strong>App de Dictado</strong> está diseñada para ayudarte a mejorar tu ortografía y comprensión auditiva. Sigue estos pasos para comenzar tu <em>spelling practice</em>:
            </p>
            <ol>
              <li><strong>Ingresa tus palabras:</strong> Escribe una palabra por línea en el área de texto.</li>
              <li><strong>Selecciona el idioma:</strong> Elige el idioma que deseas practicar.</li>
              <li><strong>Ajusta la velocidad:</strong> Modifica la velocidad de la voz según tu nivel.</li>
              <li><strong>¡Inicia el dictado online!</strong> Escucha atentamente y escribe lo que oyes. Al final, obtendrás un resumen de tus resultados.</li>
            </ol>
          </div>

          <div class="instructions-content">
            <h2>How to use our Online Dictation Tool?</h2>
            <p>
              Our <strong>Online Dictation Tool</strong> is designed to help you improve your spelling and listening skills. Follow these steps to start your <em>spelling practice</em>:
            </p>
            <ol>
              <li><strong>Enter your words:</strong> Type one word per line in the text area.</li>
              <li><strong>Select the language:</strong> Choose the language you want to practice.</li>
              <li><strong>Adjust the speed:</strong> Modify the voice speed according to your level.</li>
              <li><strong>Start the online dictation!</strong> Listen carefully and type what you hear. At the end, you will get a summary of your results.</li>
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
