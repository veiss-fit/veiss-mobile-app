// components/WorkoutPicker.js
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import Feather from 'react-native-vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ViewPastWorkoutCard from './viewPastWorkoutCard';

const CUSTOM_KEY = 'workout:templates:v1';
const HIDE_PUSH_KEY = 'workout:hidePush:v1';
const DEFAULT_EXERCISES = ['Bench Press', 'Shoulder Press', 'Tricep Dips'];

export default function WorkoutPicker({ hideDefaultPush, setHideDefaultPush, customWorkouts, setCustomWorkouts, onPick }) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [draft, setDraft] = useState('');
  const [exs, setExs] = useState([]);

  useEffect(() => { (async () => {
    try {
      const raw = await AsyncStorage.getItem(CUSTOM_KEY); if (raw) setCustomWorkouts(JSON.parse(raw));
      const hiddenRaw = await AsyncStorage.getItem(HIDE_PUSH_KEY); if (hiddenRaw) setHideDefaultPush(JSON.parse(hiddenRaw) === true);
    } catch {}
  })(); }, [setCustomWorkouts, setHideDefaultPush]);

  const saveTemplates = useCallback(async (list) => {
    try { await AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); setCustomWorkouts(list); } catch {}
  }, [setCustomWorkouts]);

  const hidePush = useCallback(async (hidden) => {
    try { await AsyncStorage.setItem(HIDE_PUSH_KEY, JSON.stringify(Boolean(hidden))); setHideDefaultPush(Boolean(hidden)); } catch {}
  }, [setHideDefaultPush]);

  const deleteWorkout = async (n) => {
    Alert.alert('Delete Workout', `Delete "${n}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        if (n === 'Push') return hidePush(true);
        const next = (customWorkouts || []).filter(w => w.name !== n);
        await saveTemplates(next);
      } },
    ]);
  };

  const addChip = () => {
    const v = (draft || '').trim(); if (!v) return;
    if (exs.some(e => e.toLowerCase() === v.toLowerCase())) return setDraft('');
    setExs((p) => [...p, v]); setDraft('');
  };

  const saveNew = async () => {
    const nm = (name || '').trim(); const lines = exs.map(s=>s.trim()).filter(Boolean);
    if (!nm) return Alert.alert('Name required', 'Please enter a workout name.');
    if (!lines.length) return Alert.alert('Exercises required', 'Add at least one exercise.');
    if ((customWorkouts || []).some(w => w.name.toLowerCase() === nm.toLowerCase())) {
      return Alert.alert('Already exists', `"${nm}" already exists. Choose a different name.`);
    }
    const next = [...(customWorkouts || []), { name: nm, exercises: lines }];
    await saveTemplates(next);
    setShowAdd(false); setName(''); setDraft(''); setExs([]);
    Alert.alert('Saved', 'Your workout template has been saved.');
  };

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.h}>Select Workout</Text>
      <Text style={styles.sub}>Choose your training focus</Text>

      {!hideDefaultPush && (
        <View style={styles.item}>
          <Swipeable renderRightActions={() => (
            <View style={styles.rail}>
              <TouchableOpacity style={styles.del} onPress={() => deleteWorkout('Push')} activeOpacity={0.9}>
                <Feather name="trash-2" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          )} overshootRight={false}>
            <TouchableOpacity style={styles.card} onPress={() => onPick({ name: 'Push', exercises: DEFAULT_EXERCISES })} activeOpacity={0.9}>
              <Text style={styles.title}>Push</Text>
              <Text style={styles.meta}>{DEFAULT_EXERCISES.length} exercises</Text>
            </TouchableOpacity>
          </Swipeable>
        </View>
      )}

      {(customWorkouts || []).map((w) => (
        <View key={w.name} style={styles.item}>
          <Swipeable renderRightActions={() => (
            <View style={styles.rail}>
              <TouchableOpacity style={styles.del} onPress={() => deleteWorkout(w.name)} activeOpacity={0.9}>
                <Feather name="trash-2" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          )} overshootRight={false}>
            <TouchableOpacity style={styles.card} onPress={() => onPick(w)} activeOpacity={0.9}>
              <Text style={styles.title}>{w.name}</Text>
              <Text style={styles.meta}>{w.exercises?.length || 0} exercises</Text>
            </TouchableOpacity>
          </Swipeable>
        </View>
      ))}

      {!showAdd ? (
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)} activeOpacity={0.9}>
          <Feather name="plus" size={16} color="#000" /><Text style={styles.addTxt}>Add Workout</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.addCard}>
          <View style={styles.rowBetween}>
            <View><Text style={styles.addTitle}>New Workout</Text><Text style={styles.hint}>Name it and add exercises</Text></View>
            <TouchableOpacity onPress={() => { setShowAdd(false); setName(''); setDraft(''); setExs([]); }}>
              <Feather name="x" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          <TextInput style={styles.input} placeholder="Workout name" value={name} onChangeText={setName} />
          <View style={styles.chipRow}>
            <TextInput style={styles.chipInput} placeholder="Add an exercise and press +" value={draft} onChangeText={setDraft} onSubmitEditing={addChip}/>
            <TouchableOpacity style={styles.plus} onPress={addChip}><Feather name="plus" size={18} color="#000" /></TouchableOpacity>
          </View>

          <View style={styles.chips}>
            {exs.map((e)=>(
              <View key={e} style={styles.chip}>
                <Text style={styles.chipTxt}>{e}</Text>
                <TouchableOpacity onPress={()=>setExs(p=>p.filter(x=>x!==e))} style={{marginLeft:6}}><Feather name="x" size={12} color="#111"/></TouchableOpacity>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.save} onPress={saveNew}><Text style={styles.saveTxt}>Save Workout</Text></TouchableOpacity>
        </View>
      )}

      <View style={{ marginTop: 20 }}>
        <ViewPastWorkoutCard contentSpacing={16} gapBetweenDateAndList={16} innerGap={16} />
      </View>

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body:{ paddingHorizontal:20, paddingTop:20, paddingBottom:72 },
  h:{ fontSize:24, fontWeight:'bold', textAlign:'center', marginBottom:6 },
  sub:{ fontSize:14, textAlign:'center', color:'#666', marginBottom:14 },
  item:{ marginTop:8 }, card:{ padding:16, backgroundColor:'#f9f9f9', borderRadius:16, borderWidth:1, borderColor:'#e0e0e0', alignItems:'center' },
  title:{ fontSize:16, fontWeight:'700', color:'#111' }, meta:{ fontSize:13, color:'#555', marginTop:2 },
  rail:{ width:64, height:'100%', justifyContent:'center' }, del:{ flex:1, backgroundColor:'#E53935', borderTopRightRadius:16, borderBottomRightRadius:16, alignItems:'center', justifyContent:'center' },
  addBtn:{ marginTop:10, backgroundColor:'#FFC300', paddingVertical:12, borderRadius:999, alignItems:'center', flexDirection:'row', justifyContent:'center' },
  addTxt:{ marginLeft:8, fontWeight:'800', color:'#000' },
  addCard:{ marginTop:10, backgroundColor:'#fff', borderRadius:16, borderWidth:1, borderColor:'#eaeaea', padding:14 },
  rowBetween:{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  addTitle:{ fontSize:18, fontWeight:'800', color:'#111' }, hint:{ color:'#666', marginTop:2 },
  input:{ marginTop:8, borderWidth:1, borderColor:'#e0e0e0', backgroundColor:'#fafafa', borderRadius:12, paddingHorizontal:12, paddingVertical:12, fontSize:14 },
  chipRow:{ marginTop:8, borderWidth:1, borderColor:'#e0e0e0', backgroundColor:'#fafafa', borderRadius:999, paddingHorizontal:12, paddingVertical:10, flexDirection:'row', alignItems:'center' },
  chipInput:{ flex:1, fontSize:14, color:'#111' },
  plus:{ width:34, height:34, borderRadius:17, backgroundColor:'#FFC300', alignItems:'center', justifyContent:'center', marginLeft:8 },
  chips:{ flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:8 },
  chip:{ flexDirection:'row', alignItems:'center', paddingVertical:6, paddingHorizontal:10, backgroundColor:'#fff8d6', borderRadius:999, borderWidth:1, borderColor:'#f3d36c' },
  chipTxt:{ fontSize:13, fontWeight:'700', color:'#111' },
  save:{ marginTop:10, backgroundColor:'#FFC300', paddingVertical:12, borderRadius:12, alignItems:'center' },
  saveTxt:{ color:'#000', fontWeight:'800' },
});
