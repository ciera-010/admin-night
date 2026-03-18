import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

// 시스템 모듈 import
import { buildSystemPrompt, estimateTokens } from '../systems';
import { 
  parseAIResponse, 
  formatMetaInfo 
} from '../systems';
import {
  INITIAL_GAME_STATE,
  getExcitementLevel,
  getRelationshipStage,
  checkPacingViolation,
  detectActionType,
  extractEndingKeywords,
  checkBranchPoint,
  getStateSummary
} from '../systems';
import {
  ENDING_STYLES,
  checkEndingCondition,
  getEndingData,
  calculateEndingProgress,
  generateEndingHint
} from '../systems';

// 🆕 공이었수 전용 모듈
import { getFormerTopDialogue, getFormerTopPsychologicalStage } from '../data/Dialoguepatterns.js';
import { getSceneCalling } from '../data/sceneCallings.js';
import { findSuType } from '../data/Charactertypes-complete.js';

import './ChatInterface.css';

function ChatInterface() {
  const { storyId } = useParams();
  const navigate = useNavigate();
  
  // 기본 state
  const [story, setStory] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStory, setIsLoadingStory] = useState(true);
  const [backgroundImage, setBackgroundImage] = useState(null);
  
  // 게임 상태 (통합)
  const [gameState, setGameState] = useState({
    affectionGong: 0,
    affectionSu: 0,
    excitement: 0,
    currentTurn: 1,
    triggeredKeywords: [],
    triggeredEvents: [],
    badChoiceCount: 0,
    currentScene: {
      time: null,
      location: null,
      charAState: null,
      charBState: null
    }
  });
  
  // AdminPage 설정 (스토리에서 로드)
  const [adminSettings, setAdminSettings] = useState({
    excitementSettings: {},
    eventKeywords: {},
    balanceSettings: {}
  });
  
  // 엔딩 관련
  const [currentEnding, setCurrentEnding] = useState(null);
  const [showEndingScreen, setShowEndingScreen] = useState(false);
  const [endingHints, setEndingHints] = useState([]);
  
  // 분기점 알림
  const [branchNotification, setBranchNotification] = useState(null);
  
  const messagesEndRef = useRef(null);

  // 편의를 위한 개별 값 추출
  const { affectionGong, affectionSu, excitement, currentTurn, triggeredKeywords, badChoiceCount } = gameState;
  const avgAffection = Math.floor((affectionGong + affectionSu) / 2);

  // ============================================
  // 유틸리티 함수
  // ============================================

  // 이미지 경로 처리
  const getImageSrc = useCallback((imagePath) => {
    if (!imagePath) return null;
    if (imagePath.startsWith('http') || imagePath.startsWith('data:')) return imagePath;
    
    const publicUrl = process.env.PUBLIC_URL || '';
    let cleanPath = imagePath;
    
    while (cleanPath.startsWith(publicUrl) && publicUrl) {
      cleanPath = cleanPath.substring(publicUrl.length);
    }
    if (!cleanPath.startsWith('/')) cleanPath = '/' + cleanPath;
    
    return `${publicUrl}${cleanPath}`;
  }, []);

  // 스크롤 자동 이동
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // ============================================
  // 스토리 로드
  // ============================================

  const loadStory = useCallback(async () => {
    console.log('🔍 Loading story for chat with ID:', storyId);
    
    try {
      // 1. Firebase에서 먼저 찾기
      const docRef = doc(db, 'stories', String(storyId));
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const foundStory = { id: docSnap.id, ...docSnap.data() };
        console.log('✅ Story found in Firebase:', foundStory.title);
        initializeStory(foundStory);
        return;
      }
      
      // 2. localStorage에서 찾기
      const stories = JSON.parse(localStorage.getItem('kind_cat_stories') || '[]');
      const foundStory = stories.find(s => String(s.id) === String(storyId));
      
      if (foundStory) {
        console.log('✅ Story found in localStorage:', foundStory.title);
        initializeStory(foundStory);
        return;
      }
      
      // 3. 못 찾음
      console.error('❌ Story not found:', storyId);
      setIsLoadingStory(false);
      alert('스토리를 찾을 수 없습니다!');
      navigate('/');
      
    } catch (error) {
      console.error('❌ Error loading story:', error);
      
      // Firebase 에러 시 localStorage fallback
      try {
        const stories = JSON.parse(localStorage.getItem('kind_cat_stories') || '[]');
        const foundStory = stories.find(s => String(s.id) === String(storyId));
        
        if (foundStory) {
          console.log('✅ Fallback to localStorage:', foundStory.title);
          initializeStory(foundStory);
          return;
        }
      } catch (e) {
        console.error('localStorage error:', e);
      }
      
      setIsLoadingStory(false);
      alert('스토리 로딩 중 오류가 발생했습니다.');
      navigate('/');
    }
  }, [storyId, navigate]);

  // 스토리 초기화
  const initializeStory = (foundStory) => {
    setStory(foundStory);
    
    // 게임 상태 초기화
    setGameState({
      ...INITIAL_GAME_STATE,
      currentScene: {
        time: foundStory.scenario?.time || null,
        location: foundStory.scenario?.location || null,
        charAState: null,
        charBState: null
      }
    });
    
    // AdminPage 설정 로드
    setAdminSettings({
      excitementSettings: foundStory.excitementSettings || {},
      eventKeywords: foundStory.eventKeywords || {},
      balanceSettings: foundStory.balanceSettings || {}
    });
    
    // 시작 메시지
    setMessages([
      {
        role: 'system',
        content: foundStory.scenario?.situation || '두 사람이 마주쳤다.',
        type: 'narration'
      }
    ]);
    
    setIsLoadingStory(false);
  };

  useEffect(() => {
    loadStory();
  }, [loadStory]);

  // ============================================
  // 배경 이미지 업데이트
  // ============================================

  const updateBackgroundImage = useCallback((keyword = null) => {
    if (!story) return;

    // 1. 키워드 기반 이미지 (우선)
    if (keyword && story.keywordImages) {
      const keywordImage = story.keywordImages.find(ki => 
        ki.keyword && keyword.toLowerCase().includes(ki.keyword.toLowerCase())
      );
      if (keywordImage?.image) {
        console.log('🖼️ 키워드 배경 변경:', keyword);
        setBackgroundImage(keywordImage.image);
        return;
      }
    }

    // 2. 호감도 기반 이미지
    if (story.backgroundImages) {
      let bgArray = [];
      if (avgAffection <= 20) {
        bgArray = story.backgroundImages[0] || story.backgroundImages['0'] || [];
      } else if (avgAffection <= 40) {
        bgArray = story.backgroundImages[20] || story.backgroundImages['20'] || [];
      } else if (avgAffection <= 60) {
        bgArray = story.backgroundImages[40] || story.backgroundImages['40'] || [];
      } else if (avgAffection <= 80) {
        bgArray = story.backgroundImages[60] || story.backgroundImages['60'] || [];
      } else {
        bgArray = story.backgroundImages[80] || story.backgroundImages['80'] || [];
      }

      if (bgArray.length > 0) {
        const index = Math.floor((avgAffection % 20) / 20 * bgArray.length);
        const selectedImage = bgArray[Math.min(index, bgArray.length - 1)];
        setBackgroundImage(selectedImage);
      }
    }
  }, [story, avgAffection]);

  useEffect(() => {
    if (story?.backgroundImages) {
      updateBackgroundImage();
    }
  }, [avgAffection, story, updateBackgroundImage]);

  // ============================================
  // 키워드 & 페이싱 체크
  // ============================================

  // 사용자 입력에서 키워드 체크
  const checkKeywordInInput = (text) => {
    if (!story) return;
    
    // 배경 이미지 키워드 체크
    if (story.keywordImages) {
      for (const ki of story.keywordImages) {
        if (ki.keyword && text.toLowerCase().includes(ki.keyword.toLowerCase())) {
          updateBackgroundImage(ki.keyword);
          break;
        }
      }
    }
    
    // 엔딩 키워드 체크 (시스템 모듈 사용)
    if (story.endings) {
      const extracted = extractEndingKeywords(text, story.endings);
      const newKeywords = [...triggeredKeywords];
      
      // 트루 엔딩 키워드
      extracted.true.forEach(kw => {
        const key = `true:${kw}`;
        if (!newKeywords.includes(key)) {
          newKeywords.push(key);
        }
      });
      
      // 히든 엔딩 키워드
      extracted.hidden.forEach(kw => {
        const key = `hidden:${kw}`;
        if (!newKeywords.includes(key)) {
          newKeywords.push(key);
        }
      });
      
      // 배드 엔딩 키워드 (즉시 배드)
      if (extracted.bad.length > 0 && !newKeywords.includes('bad:triggered')) {
        newKeywords.push('bad:triggered');
      }
      
      if (newKeywords.length !== triggeredKeywords.length) {
        setGameState(prev => ({
          ...prev,
          triggeredKeywords: newKeywords
        }));
      }
    }
  };

  // 페이싱 체크 (급발진 방지)
  const checkUserAction = (text) => {
    const actionType = detectActionType(text);
    if (actionType) {
      const violation = checkPacingViolation(actionType, gameState);
      if (violation.violation) {
        console.log('⚠️ 페이싱 위반:', violation.message);
        return violation;
      }
    }
    return null;
  };

  // ============================================
  // 엔딩 시스템
  // ============================================

  // 엔딩 판정 (시스템 모듈 사용)
  const checkEnding = useCallback(() => {
    if (!story?.endings) return null;
    
    const result = checkEndingCondition(gameState, story);
    return result.canTrigger ? result.type : null;
  }, [story, gameState]);

  // 엔딩 트리거
  const triggerEnding = () => {
    const ending = checkEnding();
    if (ending && story?.endings?.[ending]) {
      setCurrentEnding(ending);
      setShowEndingScreen(true);
    } else {
      // 엔딩 힌트 표시
      const hints = generateEndingHint(gameState, story);
      if (hints.length > 0) {
        setEndingHints(hints);
        setTimeout(() => setEndingHints([]), 5000);
      }
    }
  };

  // 엔딩 진행도 업데이트
  useEffect(() => {
    if (story?.endings) {
      const progress = calculateEndingProgress(gameState, story);
      console.log('📊 엔딩 진행도:', progress);
    }
  }, [gameState, story]);

  // ============================================
  // 게임 상태 업데이트
  // ============================================

  const updateGameState = (parsed) => {
    const prevAvg = avgAffection;
    
    // 밸런스 설정에서 제한값 가져오기
    const {
      affectionGainMax = 15,
      affectionLossMax = -10,
      excitementGainMax = 15
    } = adminSettings.balanceSettings || {};
    
    setGameState(prev => {
      // AI 응답에서 변화량 추출
      let gongChange = parsed.scores?.affectionGongChange || parsed.affection_gong_change || 0;
      let suChange = parsed.scores?.affectionSuChange || parsed.affection_su_change || 0;
      let excitementChange = parsed.scores?.excitementChange || parsed.excitement_change || 0;
      
      // 밸런스 설정에 따른 클램핑
      gongChange = Math.max(affectionLossMax, Math.min(affectionGainMax, gongChange));
      suChange = Math.max(affectionLossMax, Math.min(affectionGainMax, suChange));
      excitementChange = Math.max(-20, Math.min(excitementGainMax, excitementChange));
      
      const newGong = Math.max(0, Math.min(100, prev.affectionGong + gongChange));
      const newSu = Math.max(0, Math.min(100, prev.affectionSu + suChange));
      const newExcitement = Math.max(0, Math.min(100, prev.excitement + excitementChange));
      
      // 혐오 행동 체크 (밸런스 설정 반영)
      const badThreshold = adminSettings.balanceSettings?.badChoiceThreshold || -5;
      let newBadCount = prev.badChoiceCount;
      if (gongChange <= badThreshold || suChange <= badThreshold) {
        newBadCount += 1;
      }
      
      // 트리거된 키워드 업데이트
      const newKeywords = [...prev.triggeredKeywords];
      if (parsed.triggered_keywords) {
        parsed.triggered_keywords.forEach(kw => {
          if (!newKeywords.includes(kw)) {
            newKeywords.push(kw);
          }
        });
      }
      
      return {
        ...prev,
        affectionGong: newGong,
        affectionSu: newSu,
        excitement: newExcitement,
        currentTurn: prev.currentTurn + 1,
        badChoiceCount: newBadCount,
        triggeredKeywords: newKeywords,
        currentScene: parsed.meta ? {
          time: parsed.meta.time || parsed.time || prev.currentScene.time,
          location: parsed.meta.location || parsed.location || prev.currentScene.location,
          charAState: parsed.meta.charAState || parsed.meta.char_a_state || parsed.char_a_state,
          charBState: parsed.meta.charBState || parsed.meta.char_b_state || parsed.char_b_state
        } : prev.currentScene
      };
    });
    
    // 분기점 체크
    const newAvg = Math.floor(
      ((affectionGong + (parsed.scores?.affectionGongChange || parsed.affection_gong_change || 0)) + 
       (affectionSu + (parsed.scores?.affectionSuChange || parsed.affection_su_change || 0))) / 2
    );
    const branchCheck = checkBranchPoint(prevAvg, newAvg);
    if (branchCheck.reached) {
      setBranchNotification(branchCheck.message);
      setTimeout(() => setBranchNotification(null), 4000);
    }
    
    // 이벤트 키워드 체크
    checkEventKeywords(parsed);
  };
  
  // 이벤트 키워드 체크 함수
  const checkEventKeywords = (parsed) => {
    const { eventKeywords = {} } = adminSettings;
    const responseText = JSON.stringify(parsed).toLowerCase();
    
    // 분기점 키워드 체크
    if (eventKeywords.branchPoints) {
      eventKeywords.branchPoints.forEach(bp => {
        if (bp.enabled !== false && responseText.includes(bp.keyword?.toLowerCase())) {
          setBranchNotification(`🔀 ${bp.effect || '중요한 분기점에 도달했습니다!'}`);
          setTimeout(() => setBranchNotification(null), 4000);
        }
      });
    }
    
    // 특별 이벤트 키워드 체크
    if (eventKeywords.specialEvents) {
      eventKeywords.specialEvents.forEach(se => {
        if (se.enabled !== false && responseText.includes(se.keyword?.toLowerCase())) {
          setMessages(prev => [...prev, {
            role: 'system',
            content: `✨ ${se.effect || '특별한 이벤트가 발생했습니다!'}`,
            type: 'event'
          }]);
        }
      });
    }
  };

  // ============================================
  // AI 응답 처리
  // ============================================

  const processAIResponse = (aiResponse) => {
    // 시스템 모듈의 파서 사용
    const parsed = parseAIResponse(aiResponse);
    
    if (parsed.success) {
      // 게임 상태 업데이트
      updateGameState(parsed.isFallback ? { scores: {} } : parsed);

      const newMessages = [];
      const newExcitement = excitement + (parsed.scores?.excitementChange || parsed.excitement_change || 0);
      const excitementInfo = getExcitementLevel(newExcitement);
      const relationshipStage = getRelationshipStage(avgAffection);
      
      // AdminPage 흥분도 설정에서 레벨 이름 가져오기
      const getExcitementLevelName = (level) => {
        const settings = adminSettings.excitementSettings;
        if (settings && settings[`level${level}`]) {
          return settings[`level${level}`].name;
        }
        // 기본값
        const defaultNames = ['', '평온', '은근한 긴장', '의식', '뚜렷한 욕망', '절정 직전', '완전한 흥분'];
        return defaultNames[level] || `Lv.${level}`;
      };

      // 메타 정보 메시지
      if (parsed.meta && (parsed.meta.time || parsed.meta.location)) {
        const gongChange = parsed.scores?.affectionGongChange || parsed.raw?.affection_gong_change || parsed.affection_gong_change || 0;
        const suChange = parsed.scores?.affectionSuChange || parsed.raw?.affection_su_change || parsed.affection_su_change || 0;
        const excitementChange = parsed.scores?.excitementChange || parsed.raw?.excitement_change || parsed.excitement_change || 0;
        
        const metaContent = `━━━━━━━━━━━━━━━━━━━━
⏰ ${parsed.meta.time || parsed.time || gameState.currentScene.time || '현재'}
📍 ${parsed.meta.location || parsed.location || gameState.currentScene.location || '알 수 없음'}
━━━━━━━━━━━━━━━━━━━━

🔺 ${story.characterA?.name} (${story.characterA?.age}세)
   ▫️ 상태: ${parsed.meta.charAState?.pose || parsed.char_a_state?.pose || '알 수 없음'}
   ▫️ 복장: ${parsed.meta.charAState?.clothing || parsed.char_a_state?.clothing || '알 수 없음'}
   ▫️ 호감도: ${affectionGong + gongChange}/100 (${gongChange >= 0 ? '+' : ''}${gongChange})

🔻 ${story.characterB?.name} (${story.characterB?.age}세)
   ▫️ 상태: ${parsed.meta.charBState?.pose || parsed.char_b_state?.pose || '알 수 없음'}
   ▫️ 복장: ${parsed.meta.charBState?.clothing || parsed.char_b_state?.clothing || '알 수 없음'}
   ▫️ 호감도: ${affectionSu + suChange}/100 (${suChange >= 0 ? '+' : ''}${suChange})

💗 관계: ${relationshipStage.name}
🔥 흥분: ${newExcitement}/100 - ${getExcitementLevelName(excitementInfo.level)} (${excitementChange >= 0 ? '+' : ''}${excitementChange})
━━━━━━━━━━━━━━━━━━━━`;

        newMessages.push({
          role: 'assistant',
          content: metaContent,
          type: 'meta'
        });
      }

      // 서술
      if (parsed.narration) {
        newMessages.push({ 
          role: 'assistant', 
          content: parsed.narration, 
          type: 'narration' 
        });
      }

      // 대사
      if (parsed.dialogues && parsed.dialogues.length > 0) {
        parsed.dialogues.forEach(d => {
          if (d.speaker && d.text) {
            newMessages.push({
              role: 'assistant',
              content: `${d.speaker}: "${d.text}"`,
              type: 'dialogue',
              character: d.speaker
            });
          }
        });
      }

      // 선택지
      const choices = parsed.choices || parsed.raw?.choices;
      if (choices && Array.isArray(choices) && choices.length > 0) {
        newMessages.push({
          role: 'choices',
          content: choices,
          type: 'choices'
        });
      }

      setMessages(prev => [...prev, ...newMessages]);

    } else {
      // 파싱 실패 시 원본 텍스트 표시
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: aiResponse,
        type: 'text'
      }]);
    }
  };

  // ============================================
  // 메시지 전송
  // ============================================

  const handleSend = async () => {
    if (!input.trim() || isLoading || !story) return;

    // 페이싱 체크
    const pacingViolation = checkUserAction(input);
    if (pacingViolation) {
      setMessages(prev => [...prev, {
        role: 'system',
        content: `⚠️ ${pacingViolation.message}`,
        type: 'warning'
      }]);
    }

    const userMessage = { role: 'user', content: input, type: 'user' };
    setMessages(prev => [...prev, userMessage]);
    
    // 키워드 체크
    checkKeywordInInput(input);
    
    setInput('');
    setIsLoading(true);

    try {
      const apiKey = localStorage.getItem('gemini_api_key');
      if (!apiKey) {
        alert('API 키가 없습니다!');
        navigate(`/apikey/${storyId}`);
        setIsLoading(false);
        return;
      }

      // 시스템 프롬프트 생성 (모듈 사용 + AdminPage 설정 반영)
      const systemPrompt = buildSystemPrompt(story, gameState, adminSettings);
      
      // 디버그 로그
      console.log('📝 System prompt generated:', {
        tokens: estimateTokens(systemPrompt),
        hasExcitementSettings: !!adminSettings.excitementSettings,
        hasEventKeywords: !!adminSettings.eventKeywords,
        hasBalanceSettings: !!adminSettings.balanceSettings
      });

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: systemPrompt + '\n\n사용자 선택: ' + input }]
              }
            ],
            generationConfig: {
              temperature: 0.9,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 1024
            }
          })
        }
      );

      // 429 에러 시 재시도
      if (response.status === 429) {
        setMessages(prev => [...prev, {
          role: 'system',
          content: '⏳ API 요청 한도 초과... 10초 후 자동 재시도합니다.',
          type: 'info'
        }]);
        
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        const retryResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\n사용자 선택: ' + input }] }],
              generationConfig: { temperature: 0.9, topK: 40, topP: 0.95, maxOutputTokens: 1024 }
            })
          }
        );
        
        if (!retryResponse.ok) {
          throw new Error(`재시도 실패: ${retryResponse.status}`);
        }
        
        const retryData = await retryResponse.json();
        if (retryData.candidates?.[0]?.content?.parts?.[0]?.text) {
          processAIResponse(retryData.candidates[0].content.parts[0].text);
        }
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error(`API 오류: ${response.status}`);
      }

      const data = await response.json();

      if (!data.candidates || data.candidates.length === 0) {
        throw new Error('AI 응답이 없습니다.');
      }

      const aiResponse = data.candidates[0].content.parts[0].text;
      processAIResponse(aiResponse);

    } catch (error) {
      console.error('AI 응답 오류:', error);
      setMessages(prev => [...prev, {
        role: 'system',
        content: `⚠️ 오류가 발생했습니다: ${error.message}`,
        type: 'error'
      }]);
    }

    setIsLoading(false);
  };

  const handleChoiceClick = (choice) => {
    setInput(choice);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 게임 재시작
  const handleRestart = () => {
    setShowEndingScreen(false);
    setCurrentEnding(null);
    setGameState({
      ...INITIAL_GAME_STATE,
      currentScene: {
        time: story?.scenario?.time || null,
        location: story?.scenario?.location || null,
        charAState: null,
        charBState: null
      }
    });
    setMessages([{
      role: 'system',
      content: story?.scenario?.situation || '두 사람이 마주쳤다.',
      type: 'narration'
    }]);
  };

  // ============================================
  // 렌더링
  // ============================================

  // 로딩 중
  if (isLoadingStory) {
    return (
      <div className="chat-interface">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>스토리를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // 스토리 없음
  if (!story) {
    return (
      <div className="chat-interface">
        <div className="error-container">
          <h2>⚠️ 스토리를 찾을 수 없습니다</h2>
          <p>스토리 ID: {storyId}</p>
          <button className="btn-back" onClick={() => navigate('/')}>
            홈으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  // 엔딩 화면
  if (showEndingScreen && currentEnding && story?.endings?.[currentEnding]) {
    const endingData = getEndingData(currentEnding, story);
    const style = ENDING_STYLES[currentEnding] || ENDING_STYLES.normal;

    return (
      <div className="ending-screen">
        {endingData.cgImage && (
          <div 
            className="ending-bg"
            style={{ backgroundImage: `url(${getImageSrc(endingData.cgImage)})` }}
          />
        )}
        <div className="ending-overlay" style={{ background: style.bg }} />
        
        <div className="ending-content">
          <span className="ending-icon-large">{style.icon}</span>
          <h1 className="ending-label">{style.label}</h1>
          <h2 className="ending-name">{endingData.name}</h2>
          
          <div className="ending-description">
            <p>{endingData.description}</p>
          </div>
          
          {endingData.reward && currentEnding === 'true' && (
            <div className="ending-reward">
              <span>🎁</span> {endingData.reward}
            </div>
          )}
          
          <div className="ending-stats">
            <div className="ending-stat">
              <span className="ending-stat-label">{story.characterA?.name}</span>
              <span className="ending-stat-value">{affectionGong}%</span>
            </div>
            <div className="ending-stat">
              <span className="ending-stat-label">{story.characterB?.name}</span>
              <span className="ending-stat-value">{affectionSu}%</span>
            </div>
          </div>
          
          <div className="ending-actions">
            <button className="btn-restart" onClick={handleRestart}>
              🔄 처음부터 다시하기
            </button>
            <button className="btn-home" onClick={() => navigate('/')}>
              🏠 홈으로
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 메인 UI
  const excitementInfo = getExcitementLevel(excitement);
  const relationshipStage = getRelationshipStage(avgAffection);

  return (
    <div 
      className="chat-interface"
      style={{
        backgroundImage: backgroundImage ? `url(${getImageSrc(backgroundImage)})` : 'none'
      }}
    >
      {/* 분기점 알림 */}
      {branchNotification && (
        <div className="branch-notification">
          {branchNotification}
        </div>
      )}
      
      {/* 엔딩 힌트 */}
      {endingHints.length > 0 && (
        <div className="ending-hints">
          {endingHints.map((hint, i) => (
            <div key={i} className="ending-hint">{hint}</div>
          ))}
        </div>
      )}

      {/* 헤더 */}
      <div className="chat-header">
        <button className="btn-back" onClick={() => navigate('/')}>
          ← 홈
        </button>
        
        <div className="header-logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <img 
            src={`${process.env.PUBLIC_URL}/cat-icon.png`}
            alt="CAT" 
            className="header-cat-icon"
            onError={(e) => e.target.style.display = 'none'}
          />
        </div>
        
        <div className="header-stats">
          {/* 공 호감도 */}
          <div className="stat-item gong">
            <div className="stat-top">
              <span className="stat-label">{story.characterA?.name || '공'}</span>
              <span className="stat-state">{relationshipStage.name}</span>
            </div>
            <div className="stat-bar">
              <div className="stat-fill gong" style={{ width: `${affectionGong}%` }} />
            </div>
            <span className="stat-value">{affectionGong}%</span>
          </div>
          
          {/* 수 호감도 */}
          <div className="stat-item su">
            <div className="stat-top">
              <span className="stat-label">{story.characterB?.name || '수'}</span>
              <span className="stat-state">{relationshipStage.name}</span>
            </div>
            <div className="stat-bar">
              <div className="stat-fill su" style={{ width: `${affectionSu}%` }} />
            </div>
            <span className="stat-value">{affectionSu}%</span>
          </div>
          
          {/* 흥분도 */}
          <div className="stat-item excitement">
            <div className="stat-top">
              <span className="stat-label">💓</span>
              <span className="stat-state">Lv.{excitementInfo.level}</span>
            </div>
            <div className="stat-bar">
              <div className="stat-fill excitement" style={{ width: `${excitement}%` }} />
            </div>
            <span className="stat-value">{excitement}%</span>
          </div>
          
          {/* 턴 카운터 */}
          <div className="stat-item turn">
            <span className="stat-label">턴</span>
            <span className="stat-value">{currentTurn}</span>
          </div>
        </div>
      </div>

      {/* 메시지 컨테이너 */}
      <div className="messages-container">
        {messages.map((msg, idx) => {
          if (msg.type === 'choices') {
            return (
              <div key={idx} className="choices-container">
                {msg.content.map((choice, i) => (
                  <button
                    key={i}
                    className="choice-btn"
                    onClick={() => handleChoiceClick(choice)}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            );
          }

          return (
            <div key={idx} className={`message ${msg.role} ${msg.type || ''}`}>
              <p>{msg.content}</p>
            </div>
          );
        })}
        
        {isLoading && (
          <div className="message loading">
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* 입력 영역 */}
      <div className="input-container">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="선택하거나 직접 입력하세요..."
          disabled={isLoading}
        />
        <button onClick={handleSend} disabled={isLoading || !input.trim()}>
          전송
        </button>
        
        {/* 엔딩 확인 버튼 */}
        {avgAffection >= 50 && (
          <button 
            className="btn-ending"
            onClick={triggerEnding}
            title="현재 상태로 엔딩 보기"
          >
            🏁
          </button>
        )}
      </div>
    </div>
  );
}

export default ChatInterface;
