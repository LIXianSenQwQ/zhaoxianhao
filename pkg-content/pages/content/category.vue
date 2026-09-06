<template>
  <view class="cat-page">
    <!-- 顶部导航 -->
    <view class="page-header">
      <text class="page-title">分类管理</text>
      <text class="page-subtitle">主分类 · 子分类 · 标签</text>
    </view>

    <!-- 添加按钮 -->
    <view class="add-btn" @click="showAddDialog">
      <text class="btn-icon">＋</text>
      <text>新增分类</text>
    </view>

    <!-- 主分类列表 -->
    <view class="main-cats-list" v-if="mainCats.length">
      <view 
        v-for="mc in mainCats" 
        :key="mc._id"
        class="main-cat-item"
      >
        <view class="cat-header">
          <text class="cat-name">{{ mc.name }}</text>
          <view class="cat-actions">
            <text class="action-btn" @click.stop="renameCat(mc)">重命名</text>
            <text class="action-btn danger" @click.stop="deleteCat(mc)">删除</text>
          </view>
        </view>
        
        <!-- 子分类列表 -->
        <view class="sub-cats" v-if="getSubCats(mc.name).length">
          <view 
            v-for="sc in getSubCats(mc.name)" 
            :key="sc._id"
            class="sub-cat-item"
          >
            <text class="sub-name">{{ sc.name }}</text>
            <text class="action-btn" @click.stop="renameCat(sc)">重命名</text>
            <text class="action-btn danger" @click.stop="deleteCat(sc)">删除</text>
          </view>
        </view>

        <!-- 标签列表 -->
        <view class="tags-preview" v-if="getTagsByParent(mc.name).length">
          <scroll-view scroll-x class="tags-scroll">
            <text class="tag-chip" v-for="t in getTagsByParent(mc.name).slice(0,10)" :key="t._id">#{{ t.name }}</text>
          </scroll-view>
        </view>
      </view>
    </view>
    <view v-else class="empty-state">
      <text class="empty-icon">📁</text>
      <text class="empty-text">暂无分类，点击「＋」创建</text>
    </view>

    <!-- 添加对话框 -->
    <view v-if="dialog.visible" class="dialog-overlay" @click.self="dialog.visible = false">
      <view class="dialog-box">
        <text class="dialog-title">新增分类</text>
        <picker range-category-type @change="onTypeChange">
          <view class="picker-row">
            <text>类型：</text>
            <text>{{ typeMap[currentType] }}</text>
          </view>
        </picker>
        <input 
          v-model="newCatName"
          placeholder="分类名称"
          class="input-field"
          maxlength="20"
        />
        <view class="parent-picker" v-if="currentType === 'SUB'">
          <text class="label">所属主分类：</text>
          <picker 
            :value="subParentIndex"
            @change="onParentChange"
            :range="mainCats.map(c => c.name)"
          >
            <view class="picker-value">{{ subParent.value || '未选择' }}</view>
          </picker>
        </view>
        <view class="dialog-actions">
          <button class="cancel-btn" @click="dialog.visible = false">取消</button>
          <button class="confirm-btn" @click="submitAdd">确定</button>
        </view>
      </view>
    </view>

    <!-- 编辑对话框 -->
    <view v-if="editDialog.visible" class="dialog-overlay" @click.self="editDialog.visible = false">
      <view class="dialog-box">
        <text class="dialog-title">重命名分类</text>
        <input 
          v-model="editCatName"
          placeholder="新名称"
          class="input-field"
          maxlength="20"
          @confirm="submitRename"
        />
        <view class="dialog-actions">
          <button class="cancel-btn" @click="editDialog.visible = false">取消</button>
          <button class="confirm-btn" @click="submitRename">确定</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import * as contentSvc from '@/services/content';

type CategoryType = 'MAIN' | 'SUB' | 'TAG';

const mainCats = ref<any[]>([]);
const currentType = ref<CategoryType>('MAIN');
const newCatName = ref('');
const subParent = ref({ name: '', _id: '' });
const subParentIndex = ref(-1);

// dialog states
const dialog = ref({ visible: false });
const editDialog = ref({ visible: false });
const editCatId = ref('');
const editCatName = ref('');

const typeMap: Record<string, string> = { MAIN: '主分类', SUB: '子分类', TAG: '标签' };

async function loadCategories() {
  const res = await contentSvc.listCategories();
  if (res.success) {
    mainCats.value = res.data.categories.filter((c: any) => c.type === 'MAIN' && !c.deleted);
  }
}

function showAddDialog() {
  dialog.value.visible = true;
  currentType.value = 'MAIN';
  newCatName.value = '';
  subParent.value = { name: '', _id: '' };
}

function submitAdd() {
  if (!newCatName.value.trim()) return uni.showToast({ title: '分类名必填', icon: 'none' });
  
  const payload: any = { action: 'category.save', name: newCatName.value.trim(), type: currentType.value };
  if (currentType.value === 'SUB') {
    payload.parentId = subParent.value._id;
  } else {
    payload.level = 1; // 默认 LEVEL=1 for MAIN
  }
  
  contentSvc.saveCategory(payload).then(r => {
    if (r.success) {
      uni.showToast({ title: '已创建', icon: 'success' });
      dialog.value.visible = false;
      loadCategories();
    } else {
      uni.showToast({ title: r.data?.message || '创建失败', icon: 'none' });
    }
  }).catch(e => uni.showToast({ title: e.message, icon: 'none' }));
}

function onTypeChange(e: any) {
  currentType.value = e.detail.value as CategoryType;
  if (currentType.value !== 'SUB') {
    subParent.value = { name: '', _id: '' };
    subParentIndex.value = -1;
  }
}

function onParentChange(e: any) {
  const idx = e.detail.value;
  if (idx >= 0 && mainCats.value[idx]) {
    subParent.value = mainCats.value[idx];
    subParentIndex.value = idx;
  }
}

function renameCat(cat: any) {
  editDialog.value.visible = true;
  editCatId.value = cat._id;
  editCatName.value = cat.name;
}

function submitRename() {
  if (!editCatName.value.trim()) return uni.showToast({ title: '名称不能为空', icon: 'none' });
  contentSvc.updateCategory(editCatId.value, editCatName.value)
    .then(r => {
      if (r.success) {
        uni.showToast({ title: '已修改', icon: 'success' });
        editDialog.value.visible = false;
        loadCategories();
      } else {
        uni.showToast({ title: r.data?.message || '修改失败', icon: 'none' });
      }
    })
    .catch(e => uni.showToast({ title: e.message, icon: 'none' }));
}

function deleteCat(cat: any) {
  uni.showModal({
    title: '确认删除？',
    content: '删除后无法恢复，请谨慎操作',
    success: async (res) => {
      if (res.confirm) {
        const r = await contentSvc.deleteCategory(cat._id);
        if (r.success) {
          uni.showToast({ title: '已删除', icon: 'success' });
          loadCategories();
        } else {
          uni.showToast({ title: r.data?.message || '删除失败', icon: 'none' });
        }
      }
    }
  });
}

// Get children by parent name (for SUB/TAG lookup)
function getSubCats(parentName: string): any[] {
  const cats = mainCats.value.find(c => c.name === parentName)?.children || [];
  return cats.filter((c: any) => c.type === 'SUB' && !c.deleted);
}

function getTagsByParent(parentName: string): any[] {
  const cat = mainCats.value.find(c => c.name === parentName);
  return cat?.children?.filter((c: any) => c.type === 'TAG' && !c.deleted) || [];
}

onMounted(() => {
  loadCategories();
});
</script>

<style scoped lang="scss">
.cat-page {
  min-height: 100vh;
  background: var(--home-bg);
  padding-bottom: 60px;
}

.page-header {
  padding: 24px 16px 12px;
  text-align: center;
  
  .page-title { font-size: 24px; font-weight: bold; color: var(--home-text); }
  .page-subtitle { font-size: 13px; color: var(--home-text-2); margin-top: 2px; }
}

.add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  margin: 16px;
  background: linear-gradient(135deg, #D4B06A, #C9A063);
  border-radius: 8px;
  color: white;
  font-weight: bold;
  
  .btn-icon { font-size: 20px; }
}

.main-cats-list {
  padding: 0 16px;
  
  .main-cat-item {
    background: var(--home-card);
    border-radius: 12px;
    margin-bottom: 12px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.04);
    
    .cat-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      
      .cat-name { font-size: 16px; font-weight: bold; color: var(--home-text); }
      
      .cat-actions {
        display: flex;
        gap: 8px;
        
        .action-btn {
          font-size: 12px;
          color: var(--home-accent);
          
          &.danger { color: #FF5252; }
        }
      }
    }
    
    .sub-cats {
      padding: 8px 12px 8px 20px;
      
      .sub-cat-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px;
        background: var(--home-card-2);
        border-radius: 6px;
        margin-bottom: 4px;
        
        .sub-name { font-size: 14px; color: var(--home-text-2); }
        
        .action-btn {
          font-size: 12px;
          color: var(--home-accent);
          
          &.danger { color: #FF5252; }
        }
      }
    }
    
    .tags-preview {
      padding: 8px 12px;
      
      .tags-scroll {
        white-space: nowrap;
        
        .tag-chip {
          display: inline-block;
          padding: 4px 8px;
          margin-right: 6px;
          background: var(--home-line);
          border-radius: 4px;
          font-size: 11px;
          color: var(--home-text-2);
        }
      }
    }
  }
}

.empty-state {
  text-align: center;
  margin-top: 80px;
  
  .empty-icon { font-size: 48px; }
  .empty-text { display: block; margin-top: 12px; color: var(--home-text-2); }
}

.dialog-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
  
  .dialog-box {
    background: white;
    border-radius: 12px;
    padding: 20px;
    width: 90%;
    max-width: 320px;
    
    .dialog-title { font-size: 18px; font-weight: bold; color: var(--home-text); display: block; margin-bottom: 16px; }
    
    .picker-row, .parent-picker {
      display: flex;
      align-items: center;
      margin-bottom: 12px;
      
      .label { font-size: 14px; color: var(--home-text-2); width: 70px; }
    }
    
    .input-field {
      width: 100%;
      padding: 10px;
      margin-bottom: 12px;
      background: var(--home-card-2);
      border-radius: 8px;
      font-size: 14px;
    }
    
    .dialog-actions {
      display: flex;
      gap: 12px;
      margin-top: 16px;
      
      button {
        flex: 1;
        padding: 10px;
        border-radius: 8px;
        font-size: 14px;
        
        &.cancel-btn { background: var(--home-line); color: var(--home-text-2); }
        &.confirm-btn { background: linear-gradient(135deg, #D4B06A, #C9A063); color: white; }
      }
    }
  }
}
</style>