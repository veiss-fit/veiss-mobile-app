// components/SessionView.js
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, DeviceEventEmitter, Alert } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import ExerciseCard from './ExerciseCard';
import ToFCard from './ToFCard';
import FeedbackPanel from './FeedbackPanel';

export default function SessionView({
  workoutName,
  exercises,
  isAnyActive,
  activeExercise,
  onStart,
  onStop,
  onAddExercise,
  onDeleteExercise,
  openFeedback,
  validatedCounts,
  tof,
  onCancel,
  onFinish,
}) {
  const [adding, setAdding] = useState(false);
  const [newEx, setNewEx] = useState('');
  const [feedbackOpen, setFeedbackOpen] = useState(null);
  const [feedbackNotes, setFeedbackNotes] = useState([]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('session:open_feedback', ({ exercise, notes }) => {
      setFeedbackOpen(exercise); setFeedbackNotes(notes || []);
    });
    return () => { try { sub.remove(); } catch {} };
  }, []);

  const onCreate = () => {
    const name = (newEx || '').trim(); if (!name) return Alert.alert('Name required');
    onAddExercise(name); setNewEx(''); setAdding(false);
  };

  return (
    <ScrollView contentContainerStyle={s.body}>
      <Text style={s.h}>{workoutName}</Text>
      <Text style={s.sub}>Track your progress</Text>

      {exercises.map((ex) => {
        const isActive = activeExercise === ex.name;
        const lastSetNum = 0; // display only — real count is in parent sessionRef
        const lastValidated = validatedCounts?.[ex.name]?.[lastSetNum];

        return (
          <View key={ex.name} style={{ marginBottom: 10 }}>
            <Swipeable enabled={!isAnyActive} renderRightActions={() => (
              <View style={s.rail}>
                <TouchableOpacity style={[s.del, isAnyActive && s.dim]} onPress={() => onDeleteExercise(ex.name)} disabled={isAnyActive}>
                  <Feather name="trash-2" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            )} overshootRight={false}>
              <View style={[s.tile, isAnyActive && !isActive ? s.dim : null]}>
                <ExerciseCard
                  exercise={ex}
                  isActive={isActive}
                  isAnyActive={isAnyActive}
                  onBecameActive={() => onStart(ex.name)}
                  onFinished={() => onStop()}
                  validatedRepsLastSet={lastValidated}
                  validatedOnly
                />
              </View>
            </Swipeable>

            <View style={{ alignItems: 'flex-end', marginTop: 8, marginRight: 2 }}>
              <TouchableOpacity style={s.fbBtn} onPress={() => openFeedback(ex.name)}>
                <Feather name="zap" size={16} color="#000" /><Text style={s.fbTxt}>Live Feedback</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}

      {!!feedbackOpen && (
        <FeedbackPanel
          exerciseName={feedbackOpen}
          notes={feedbackNotes}
          onClose={() => { setFeedbackOpen(null); setFeedbackNotes([]); }}
        />
      )}

      <View style={{ marginTop: 8, marginBottom: 8 }}>
        {!adding ? (
          <TouchableOpacity style={s.add} onPress={() => setAdding(true)} disabled={isAnyActive}>
            <Feather name="plus" size={16} color="#000" /><Text style={s.addTxt}>Add Exercise</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.addCard}>
            <View style={s.addHdr}>
              <Text style={s.addTitle}>Add exercise</Text>
              <TouchableOpacity onPress={() => { setAdding(false); setNewEx(''); }}>
                <Feather name="x" size={18} color="#666" />
              </TouchableOpacity>
            </View>
            <View style={s.addRow}>
              <TextInput style={s.addInput} placeholder="Type an exercise" value={newEx} onChangeText={setNewEx} onSubmitEditing={onCreate} />
              {!!newEx && <TouchableOpacity onPress={() => setNewEx('')}><Feather name="x-circle" size={18} color="#bbb" /></TouchableOpacity>}
              <TouchableOpacity style={s.addPrimary} onPress={onCreate}><Text style={s.addPrimaryTxt}>Add</Text></TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      <View style={s.actions}>
        <TouchableOpacity style={s.cancel} onPress={onCancel}><Text style={s.cancelTxt}>Cancel Workout</Text></TouchableOpacity>
        <TouchableOpacity style={s.finish} onPress={onFinish}><Text style={s.finishTxt}>Finish Workout</Text></TouchableOpacity>
      </View>

      <ToFCard series={tof.series} meta={tof.meta} />
      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  body:{ paddingHorizontal:20, paddingTop:20, paddingBottom:160 },
  h:{ fontSize:24, fontWeight:'bold', textAlign:'center', marginBottom:6 },
  sub:{ fontSize:14, textAlign:'center', color:'#666', marginBottom:14 },
  rail:{ width:64, height:'100%', justifyContent:'center' },
  del:{ flex:1, backgroundColor:'#E53935', borderTopRightRadius:12, borderBottomRightRadius:12, alignItems:'center', justifyContent:'center' },
  tile:{ borderRadius:12, overflow:'hidden' },
  dim:{ opacity:0.5 },
  fbBtn:{ flexDirection:'row', alignItems:'center', backgroundColor:'#FFE69A', paddingVertical:6, paddingHorizontal:10, borderRadius:999 },
  fbTxt:{ marginLeft:6, color:'#000', fontWeight:'700', fontSize:12 },
  add:{ backgroundColor:'#FFC300', paddingVertical:12, borderRadius:999, alignItems:'center', justifyContent:'center', flexDirection:'row' },
  addTxt:{ color:'#000', fontWeight:'800', marginLeft:8 },
  addCard:{ backgroundColor:'#fff', borderRadius:16, borderWidth:1, borderColor:'#eaeaea', padding:12, marginTop:6 },
  addHdr:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:6 },
  addTitle:{ fontSize:16, fontWeight:'800', color:'#111' },
  addRow:{ flexDirection:'row', alignItems:'center', paddingHorizontal:12, paddingVertical:10, borderRadius:999, borderWidth:1, borderColor:'#e0e0e0', backgroundColor:'#fafafa' },
  addInput:{ flex:1, fontSize:14, color:'#111', marginRight:8 },
  addPrimary:{ paddingHorizontal:14, paddingVertical:8, borderRadius:999, backgroundColor:'#FFC300', alignItems:'center', justifyContent:'center', marginLeft:8 },
  addPrimaryTxt:{ fontWeight:'800', color:'#000' },
  actions:{ flexDirection:'row', marginTop:14, justifyContent:'space-between' },
  cancel:{ backgroundColor:'#FFE0E0', padding:14, borderRadius:8, flex:1, marginRight:8 },
  cancelTxt:{ color:'#D00000', fontWeight:'bold', textAlign:'center' },
  finish:{ backgroundColor:'#28A745', padding:14, borderRadius:8, flex:1, marginLeft:8 },
  finishTxt:{ color:'#FFF', fontWeight:'bold', textAlign:'center' },
});
