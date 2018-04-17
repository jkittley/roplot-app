import os
from PIL import Image
from lxml import objectify, etree

root_path = os.path.dirname(os.path.realpath(__file__))

def get_files():
    with open(os.path.join(root_path, '../config.xml')) as xmlfile:
        for child in etree.parse(xmlfile).getroot().getchildren():
            if 'platform' in child.tag:
                print("Platform: ", child.get('name'))
                for img in child.getchildren():

                    if 'icon' in img.tag or 'splash' in img.tag:
                        h   = img.get('height')
                        w   = img.get('width') 
                        src = img.get('src')
                        if w is None or h is None:
                            raise Exception('Missing width or height.')
                        print("Image: ", w, h, src)

                        cat = "icon" if 'icon' in img.tag else "splash"

                        yield cat, int(w), int(h), os.path.join(root_path, '../', os.path.dirname(src)), os.path.basename(src)
                    
                   

def process():
    for cat, w, h, directory, filename in get_files():
        print(w, h, directory, filename)
        if not os.path.exists(directory):
            os.makedirs(directory)
        save_path = os.path.join(directory, filename)
        if os.path.exists(save_path):
            os.remove(save_path)

        if cat == "icon":
            im = Image.open( os.path.join(root_path, "icon.png"))
        elif cat == "splash":
            if w > h:
                im = Image.open( os.path.join(root_path, "screen_landscape.png"))
            else:
                im = Image.open( os.path.join(root_path, "screen_portrait.png"))
        else:
            raise Exception('Unknown cat')
            
        # Info
        print("--",filename,"--")
        print("Dest size:", (w, h))
        print("Original:", im.size)

        resized = resize_and_crop(im, save_path, (w, h), crop_type='middle')
        print("Thumb:", resized.size)

    



def resize_and_crop(img, modified_path, size, crop_type='top'):
    """
    Resize and crop an image to fit the specified size.
    args:
        img_path: path for the image to resize.
        modified_path: path to store the modified image.
        size: `(width, height)` tuple.
        crop_type: can be 'top', 'middle' or 'bottom', depending on this
            value, the image will cropped getting the 'top/left', 'midle' or
            'bottom/rigth' of the image to fit the size.
    raises:
        Exception: if can not open the file in img_path of there is problems
            to save the image.
        ValueError: if an invalid `crop_type` is provided.
    """
    # Get current and desired ratio for the images
    img_ratio = img.size[0] / float(img.size[1])
    ratio = size[0] / float(size[1])
    #The image is scaled/cropped vertically or horizontally depending on the ratio
    if ratio > img_ratio:
        img = img.resize((size[0], int(size[0] * img.size[1] / img.size[0])), Image.ANTIALIAS)
        # Crop in the top, middle or bottom
        if crop_type == 'top':
            box = (0, 0, img.size[0], size[1])
        elif crop_type == 'middle':
            box = (0, (img.size[1] - size[1]) / 2, img.size[0], (img.size[1] + size[1]) / 2)
        elif crop_type == 'bottom':
            box = (0, img.size[1] - size[1], img.size[0], img.size[1])
        else :
            raise ValueError('ERROR: invalid value for crop_type')
        img = img.crop(box)
    elif ratio < img_ratio:
        img = img.resize((int(size[1] * img.size[0] / img.size[1]), size[1]),
                Image.ANTIALIAS)
        # Crop in the top, middle or bottom
        if crop_type == 'top':
            box = (0, 0, size[0], img.size[1])
        elif crop_type == 'middle':
            box = ((img.size[0] - size[0]) / 2, 0, (img.size[0] + size[0]) / 2, img.size[1])
        elif crop_type == 'bottom':
            box = (img.size[0] - size[0], 0, img.size[0], img.size[1])
        else :
            raise ValueError('ERROR: invalid value for crop_type')
        img = img.crop(box)
    else :
        img = img.resize((size[0], size[1]),
                Image.ANTIALIAS)
        # If the scale is the same, we do not need to crop
    img.save(modified_path)
    return img

process()